# Contributing

The useful contributions here are mostly not new features. They are the four things the
README admits are broken, plus anything you learn from running this against a flow we have
never seen.

## Set up

```bash
pnpm install
cp .env.example .env      # your own key; VOICE_MODE=direct is fine locally
pnpm dev
```

`pnpm build` is the gate — it type-checks. There is no test suite yet; see below.

## Where help is worth the most

**`AudioWorklet` instead of `ScriptProcessorNode`.** The capture path uses a deprecated node.
It works everywhere today, which is why it is still there, and it will not work everywhere
forever. This is a self-contained change in `src/voice/hooks/use-voice-session.ts` and
`src/voice/lib/pcm-audio.ts`.

**A frame loop that survives a background tab.** Frames come from a 1 s `setInterval`, which
browsers throttle when the tab is not visible. That is fine while the panel is docked in the
foreground and fatal for a floating-window mode. The fix is probably `requestAnimationFrame`
driven by whatever surface is actually visible — but measure before committing to it.

**Safari.** No `getDisplayMedia` quirks are handled beyond the two-click permission dance. If
you have a Mac and a Safari user, tell us what breaks.

**Tests for the pure logic.** `frame-diff`, `pcm-audio`, `realtime-protocol`, `media-errors`
and `system-instruction` are all pure functions with no DOM. They had tests in the codebase
this was extracted from and lost them on the way out. Bringing them back is a good first PR.

## Where help is *not* wanted

**A prompt-tuning PR against the example playbook.** The example is fictional on purpose — it
exists to show the shape, not to be good. Improving its wording teaches us nothing.

**Swapping the credential mechanism for something "cleaner".** Putting the key in a WebSocket
subprotocol looks wrong and is the only thing browsers allow. If you have found a path that
lets a browser `WebSocket` send an `Authorization` header, open an issue first — that would be
news, and it would change the design.

## House rules

- **Explain the *why* in comments, never the *what*.** Most comments in here document a
  constraint that is invisible from the code: a browser rule, a race, a thing that looked
  wrong until it wasn't. If a comment restates the line below it, delete it.
- **Code and comments in English.** User-facing copy lives in `panel-copy.ts` and is
  per-locale.
- No formatter is enforced yet. Match what is around your change.

## Reporting something

For a bug, the useful report has three things: which browser, what the panel showed
(`errorCode` and the detail line under it), and what the console printed. The `onError`
callback in `useVoiceSession` gets a context string on every fault — include it.

If it involves audio cutting out or the agent talking over you, say whether it happened on the
first turn or after several. Those are different bugs.
