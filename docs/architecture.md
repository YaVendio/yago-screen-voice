# Architecture

## Session lifecycle

```
 idle
  │  click → start()
  ▼
 requesting-consent ── getUserMedia({audio}) ──┐ denied → error(mic-denied)
  │                                            │ device fault → error(mic-unavailable)
  ▼
 awaiting-screen        ◄── STOPS HERE. One permission per user gesture.
  │                          Mic is live. 120 s deadline releases it.
  │  click → shareScreen()
  ▼
 requesting-consent ── getDisplayMedia({monitor}) ──┐ denied → error(screen-denied)
  │                                                  │ tab/window → error(partial-screen-share)
  ▼
 connecting ── POST /api/voice/token ──┐ → error(token-request-failed)
  │         ── new WebSocket(...) ─────┘ → error(connection-failed)
  │
  │  ◄── session.created  → send session.update (system instruction)
  │  ◄── session.updated  → start audio + screen pipelines
  ▼
 live ──────────────────────────────────────────┐
  │  stop()            → ended (user_ended)     │
  │  credential expiry → ended (credential_…)   │
  │  socket close      → error(connection-lost) │
  │  backlog > 10 s    → error(connection-lost) │
  ▼                                             │
 ended                                          │
```

Every terminal path funnels through `releaseResources()`, which stops both media streams,
closes both `AudioContext`s, clears four timers, and closes the socket. There is no path out
of a live session that leaves the microphone on.

## Why generation counters exist

`start()` and `shareScreen()` await browser permission prompts that can sit open for minutes.
Meanwhile the user can close the panel, which runs cleanup. When the prompt finally resolves,
the resumed function would happily open a socket for a session nobody is in — and stop tracks
that cleanup already released, or worse, acquire new ones nothing will ever stop.

`startGenerationRef` is bumped on every release. Each async entry point captures its value and
checks `isStale()` after every await, releasing whatever it acquired in the meantime.

## Threading model

Three loops run at once, none of them in React's render cycle:

| Loop | Rate | Runs in |
|---|---|---|
| Mic capture | ~every 170 ms (4096 frames @ 24 kHz) | `ScriptProcessorNode.onaudioprocess` |
| Screen capture | 1 s tick, rate-limited to ≥ 2 s between sends | `setInterval` |
| Socket messages | provider-driven, bursty | `WebSocket` message handler |

All three outlive the render that installed them, which is why liveness, mute, and pause are
tracked in refs and not in state. Reading `status` inside the socket handler would see the
value frozen at subscribe time. The state variables exist only so React can paint.

## Barge-in

```
input_audio_buffer.speech_started   ← checked FIRST in the handler
  ├─ interruptedRef = true
  └─ stopPlayback()  → stop() every scheduled AudioBufferSourceNode

response.output_audio.delta         ← still arriving for a moment after
  └─ dropped while interruptedRef is true

response.created                    ← the only thing that lifts it
  └─ interruptedRef = false
```

Both branches are guarded by `socketRef.current === socket`, so a late event from a socket
that has already been replaced cannot touch the new session's audio.

## Credential flow

```
browser                     your server                   LiteLLM proxy
   │                            │                              │
   │  POST /api/voice/token     │                              │
   ├───────────────────────────►│                              │
   │                            │  POST /key/generate          │
   │                            │  Authorization: master key   │
   │                            ├─────────────────────────────►│
   │                            │                              │
   │                            │  { key, expires }            │
   │                            │◄─────────────────────────────┤
   │                            │  ✓ body ≤ 64 KB
   │                            │  ✓ key matches HTTP token pattern
   │                            │  ✓ key ≠ master key      ← the whole point
   │                            │  ✓ expires parses, is in the future
   │  { value, wsUrl, model,    │
   │    expiresAt, ... }        │
   │◄───────────────────────────┤
   │
   │  new WebSocket(wsUrl + ?model=…,
   │    ['realtime',
   │     'openai-insecure-api-key.<value>',   ← visible to anyone with devtools
   │     'openai-beta.realtime-v1'])
   ├──────────────────────────────────────────────────────────►│
```

The subprotocol is the only place a browser `WebSocket` can carry a credential. That is not a
workaround to be improved — it is why the minted key is short-lived, budget-capped, and
single-model.

The client also arms a timer on `expiresAt` and ends the session there. A WebSocket is only
authorized at upgrade time, so without it the socket keeps streaming a microphone and a
monitor long after the key that opened it stopped being valid.

## Failure taxonomy

Nine error codes, split by who can act on them:

| The user can fix it | Nobody but you can |
|---|---|
| `mic-denied`, `screen-denied` | `token-request-failed` |
| `partial-screen-share` | `connection-failed`, `connection-lost` |
| `unsupported-browser` | |
| `mic-unavailable`, `screen-unavailable` | |

The second column is what `outage-alert.ts` posts to Slack, and only for the seven upstream
reasons that mean the feature is down for everyone rather than unlucky for one person. One
alert per reason per 15 minutes: during an outage every user hits the same wall within
seconds, and a channel buried under identical messages gets muted — which costs more than the
alert buys.

The panel shows the code *and* a detail string (`502 · realtime credential rejected`,
`socket closed · 1006`). Without the detail, a misconfiguration and an outage look identical
to whoever gets called for help.
