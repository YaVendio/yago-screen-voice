# Engineering notes

The realtime API is the easy part. What took the iterations was everything around it. Each
section below is a constraint that is invisible from the code, and the reason a tempting
simplification does not work.

## One permission per click

A browser grants one permission per user gesture. Awaiting the microphone prompt spends the
click, so asking for the screen in the same handler is rejected without ever showing the
picker — and Safari is strictest about it. The session therefore **stops** between the two
requests and waits for a second click (`status: 'awaiting-screen'`).

Which means the microphone is live while nothing else is. If the person walks away, a 120 s
deadline releases it.

## Cutting the agent off has three parts, not one

`interrupt_response: true` cancels the response upstream. That is not enough. Audio arrives
faster than it plays, so seconds of it are already scheduled in the audio graph — every
`AudioBufferSourceNode` is tracked so it can be stopped on the spot. And the provider keeps
streaming for a moment after it hears you, so a flag drops the in-flight tail until a new
`response.created` arrives.

The check runs **first** in the socket handler. Yielding late is the same as not yielding.

## Screen frames are the entire cost model

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

## Full screen only

A partial share is rejected on purpose. Real setup flows open a provider popup, which lives
outside any single tab or window — a tab share leaves the agent blind exactly where the
documented errors happen. Browsers that do not report `displaySurface` are trusted rather
than blocked.

## The credential problem

A browser `WebSocket` cannot send an `Authorization` header. The only compatible path puts the
credential in the URL or a subprotocol, which means **whatever the server returns is visible
to the client**.

So the server never returns its real key. `POST /api/voice/token` mints a per-session virtual
key — minutes-long, budget-capped, restricted to one model — and validates seven things about
what came back, including that it is not the operator key echoed straight back. That last
check is the one thing the route exists for.

See [`architecture.md`](architecture.md#credential-flow) for the full exchange.

## Nobody should say a verification code out loud

A screen-watching, always-listening agent will happily ask someone to read out the SMS code it
can see them typing. Then it is in the transcript *and* in the frames.

The shared conduct forbids asking for codes, QR codes, or card details at all, and instructs
the agent to ask for **Pause screen** before those screens and **mute** before an SMS code —
because people read codes aloud as they type them.
