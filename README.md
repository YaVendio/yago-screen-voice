# A voice agent that watches your screen

It talks someone through a setup flow the way a support person on a video call would: it sees
their screen, recognizes which step they are on, and tells them what to click next. When they
start talking, it shuts up mid-sentence.

We built it because connecting WhatsApp was the highest-friction step in our onboarding —
twelve recurring failure modes that support was resolving reactively, one screenshot at a
time. This is that system, with our internal playbook swapped for a fictional one.

Runs in the browser against any OpenAI-compatible realtime endpoint. No SDK.

```bash
git clone https://github.com/YaVendio/yago-screen-voice.git && cd yago-screen-voice
pnpm install
cp .env.example .env      # your own key
pnpm dev                  # → localhost:3000
```

Then: click, grant the microphone, share your **entire screen**, and talk.

---

## What is actually hard about this

The realtime API is the easy part. What took the iterations was everything around it.

### One permission per click

A browser grants one permission per user gesture. Awaiting the microphone prompt spends the
click, so asking for the screen in the same handler is rejected without ever showing the
picker — and Safari is strictest about it. The session therefore **stops** between the two
requests and waits for a second click (`status: 'awaiting-screen'`).

Which means the microphone is live while nothing else is. If the person walks away, a 120 s
deadline releases it.

### Cutting the agent off has three parts, not one

`interrupt_response: true` cancels the response upstream. That is not enough. Audio arrives
faster than it plays, so seconds of it are already scheduled in the audio graph — every
`AudioBufferSourceNode` is tracked so it can be stopped on the spot. And the provider keeps
streaming for a moment after it hears you, so a flag drops the in-flight tail until a new
`response.created` arrives.

The check runs **first** in the socket handler. Yielding late is the same as not yielding.

### Screen frames are the entire cost model

Three controls compose:

- **`computeFrameDifference`** samples every 17th pixel. 17 is prime — with an even step,
  every sample lands on the same columns and a checkbox between them never registers.
- **`shouldSendFrame`** enforces a 2 s floor, a 15 s keepalive ceiling (so the model does not
  go blind while idle), and a 2 % change threshold.
- Frames and audio share one 512 KB socket backlog bound. Without that, a stalled connection
  drops audio while base64 JPEGs keep queuing.

Frames go out at 1600px / JPEG 0.85 / `detail: 'high'`. Cheaper settings are tempting and
wrong: the agent asks people to click buttons **by name**, so the labels have to survive.
`detail: 'low'` downsamples the frame before the model ever sees it. The rate limiter is what
bounds cost, not the resolution.

### Full screen only

A partial share is rejected on purpose. Real setup flows open a provider popup, which lives
outside any single tab or window — a tab share leaves the agent blind exactly where the
documented errors happen. Browsers that do not report `displaySurface` are trusted rather
than blocked.

### The credential problem

A browser `WebSocket` cannot send an `Authorization` header. The only compatible path puts the
credential in the URL or a subprotocol, which means **whatever the server returns is visible
to the client**.

So the server never returns its real key. `POST /api/voice/token` mints a per-session virtual
key — minutes-long, budget-capped, restricted to one model — and validates seven things about
what came back, including that it is not the operator key echoed straight back. That last
check is the one thing the route exists for.

### Nobody should say a verification code out loud

A screen-watching, always-listening agent will happily ask someone to read out the SMS code it
can see them typing. Then it is in the transcript *and* in the frames.

The shared conduct forbids asking for codes, QR codes, or card details at all, and instructs
the agent to ask for **Pause screen** before those screens and **mute** before an SMS code —
because people read codes aloud as they type them.

---

## The playbook

The agent's knowledge is a typed structure, not a prompt string:

```ts
{
  role, scope: { allowed, refusal }, entrySteps, options[],
  finishSteps, recovery, problems: [{ signals, solution }], escalation,
  conduct?, opening
}
```

`buildSystemInstruction()` renders it at session start. Support people extend it without
touching a prompt, locales render from the same structure, and you can diff what the agent
knows between two versions.

The field that decides whether any of this works is **`signals`** — the verbatim text on the
user's screen. That is what turns *"what does the message say?"* into *"I see the credit-line
error, here is the fix"*.

See [`src/playbooks/README.md`](src/playbooks/README.md) for how to write one. Two rules from
production are worth stealing:

- **Write a closed list of what the agent may tell someone to delete.** Never a category. On
  a flow where the provider hosts the whole signup and leaves nothing to clean up, the answer
  is *nothing* — say so explicitly, or the agent improvises on someone's account.
- **Give every playbook an escalation floor.** Some failures leave debris that makes the next
  attempt harder. "Retry until it works" is not a strategy.

---

## Layout

```
src/voice/                     the agent — no app dependencies
  types.ts                     Playbook + session types
  hooks/use-voice-session.ts   the state machine: permissions, socket, audio, frames
  lib/realtime-protocol.ts     event builders + parsing (never trusts a frame)
  lib/system-instruction.ts    playbook → system instruction
  lib/pcm-audio.ts             PCM16 ↔ Float32, resampling, base64
  lib/frame-diff.ts            what is worth sending
  lib/media-errors.ts          refusal vs. broken device
  lib/outage-alert.ts          Slack alert on upstream failure, with a cooldown
  components/                  a reference panel — replace it with yours

src/playbooks/                 the knowledge. start here when adapting it
src/app/api/voice/token/       credential minting
src/app/page.tsx               the demo
```

`src/voice/` has no imports from the rest of the app. Copy the directory into your project,
give the hook a playbook, and render your own panel.

---

## Before you deploy this

The demo's token route is open, because the demo has no users. Yours must not be — it spends
money on every call:

1. **Authenticate the caller.** Refuse anonymous requests.
2. **Key the cooldown on that caller**, not on a shared bucket.
3. **If it is behind a flag or an experiment, decide the arm on the server too**, and fail
   closed. The browser's assignment is not an authorization boundary; an unreadable
   assignment must not become a free credential.
4. **Opt the transcript out of session replay.** Speech carries whatever was on the screen
   someone was reading out loud.

`VOICE_MODE=direct` hands the key straight to the browser. It refuses to run in a production
build and needs an explicit opt-in flag. It is for a laptop, not a deployment.

---

## What we know does not work yet

- **Safari** cannot run the floating-bubble mode we want next (Document Picture-in-Picture is
  Chrome/Edge/Firefox only). Today the panel is docked, which means the mute and pause
  buttons live in one tab while the user is looking at another.
- **Mobile** has no screen-share equivalent. The entry point should be hidden there.
- **`ScriptProcessorNode` is deprecated.** It still works everywhere and an `AudioWorklet`
  rewrite has not been worth it yet. It is the obvious first contribution.
- The frame loop is a 1 s `setInterval`, which browsers throttle in background tabs. Fine
  while the panel is docked in the foreground; a problem for the bubble.

---

MIT. Built at [YaVendió](https://yavendio.com).
