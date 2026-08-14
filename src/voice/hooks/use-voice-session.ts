'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  Playbook,
  RealtimeCredentials,
  TranscriptEntry,
  VoiceSessionErrorCode,
  VoiceSessionEvents,
  VoiceSessionStatus,
} from '../types'
import { FRAME_DIFF_THRESHOLD, computeFrameDifference, shouldSendFrame } from '../lib/frame-diff'
import { describeThrownFailure, readFailureReason } from '../lib/failure-detail'
import { classifyMediaFailure, isMediaRefusal } from '../lib/media-errors'
import { REALTIME_SAMPLE_RATE, decodeAudioChunk, encodeAudioChunk } from '../lib/pcm-audio'
import {
  MAX_SOCKET_BACKLOG_BYTES,
  buildAudioAppend,
  buildAudioBufferClear,
  buildGreetingRequest,
  buildRealtimeSubprotocols,
  buildRealtimeUrl,
  buildScreenFrameItem,
  buildSessionUpdate,
  isAgentTranscriptDelta,
  isAgentTranscriptDone,
  isAudioDelta,
  isResponseStarted,
  isUserSpeechStarted,
  isUserTranscriptDone,
  parseRealtimeEvent,
} from '../lib/realtime-protocol'
import { buildSystemInstruction } from '../lib/system-instruction'

/** After this many failed attempts the panel stops retrying and points at human support. */
const FAILURES_BEFORE_HUMAN_HELP = 2

const CAPTURE_BUFFER_SIZE = 4096
const FRAME_TICK_MS = 1000
// Button labels are the smallest thing the agent has to read, and they are what it asks the
// user to click by name. Tuning either of these for cost first is what makes them illegible:
// a 2560-wide screen halved to 1280 and then JPEG-crushed loses them entirely.
const FRAME_WIDTH = 1600
const FRAME_QUALITY = 0.85
const CONNECT_DEADLINE_MS = 15000
/** How long to wait for the shared screen to produce a first frame before greeting blind. */
const FIRST_FRAME_DEADLINE_MS = 3000
const FIRST_FRAME_RETRY_MS = 150
/** How long the socket may stay backed up before the session is treated as dead. */
const BACKLOG_DEADLINE_MS = 10000
/** The microphone is live between the two clicks; abandoning the panel must not leave it open. */
const AWAITING_SCREEN_DEADLINE_MS = 120000

export interface UseVoiceSessionOptions {
  playbook: Playbook
  /** Where to mint the per-session credential. */
  tokenEndpoint?: string
  /** Terms the transcription model mishears, passed as a decoding bias. */
  transcriptionHint?: string
  events?: VoiceSessionEvents
}

export function useVoiceSession({
  playbook,
  tokenEndpoint = '/api/voice/token',
  transcriptionHint,
  events,
}: UseVoiceSessionOptions) {
  const [status, setStatus] = useState<VoiceSessionStatus>('idle')
  const [errorCode, setErrorCode] = useState<VoiceSessionErrorCode | null>(null)
  // The reason behind the code, shown alongside it: the codes are deliberately broad, and
  // without the detail a configuration fault and an upstream outage look identical.
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [failureCount, setFailureCount] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isScreenPaused, setIsScreenPaused] = useState(false)

  // Callbacks are read through a ref so a caller passing an inline object does not rebuild
  // every callback in this hook on each render.
  const eventsRef = useRef(events)
  eventsRef.current = events

  const socketRef = useRef<WebSocket | null>(null)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const captureContextRef = useRef<AudioContext | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When the socket backlog first went over the bound, so a permanently congested connection
  // ends the session instead of silently dropping every frame and every audio chunk forever.
  const backloggedSinceRef = useRef(0)
  // Frames stop while paused; the user needs a way to type a verification code without it
  // being photographed and sent to the provider.
  const screenPausedRef = useRef(false)
  // Bumped whenever resources are released, so an in-flight start() that is still awaiting
  // permissions or a credential can tell it was abandoned and stop instead of resuming.
  const startGenerationRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const previousFrameRef = useRef<Uint8ClampedArray>(new Uint8ClampedArray())
  const lastFrameSentAtRef = useRef(0)
  const framesSentRef = useRef(0)
  const startedAtRef = useRef(0)
  const nextPlayTimeRef = useRef(0)
  // Everything scheduled but not yet heard. Audio arrives faster than it plays, so cancelling
  // a response upstream leaves a queue already sitting in the audio graph — without these the
  // user keeps hearing the agent for seconds after interrupting it.
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  // Set the moment the user speaks and cleared when the next answer starts, so the tail of
  // the cancelled one is discarded instead of played.
  const interruptedRef = useRef(false)
  const agentTurnRef = useRef<string | null>(null)
  // Reads as "the session is meant to be running": distinguishes a user-initiated stop from a
  // socket that dropped on its own, which the close handler cannot tell apart.
  const activeRef = useRef(false)
  // The socket handler outlives the render that installed it, so liveness is tracked in a
  // ref; reading `status` there would see the value frozen at subscribe time.
  const liveRef = useRef(false)
  // Same reason: the audio callback fires outside React's render cycle.
  const mutedRef = useRef(false)

  const report = useCallback((error: unknown, context: string) => {
    eventsRef.current?.onError?.(error, context)
  }, [])

  const releaseResources = useCallback(() => {
    liveRef.current = false
    startGenerationRef.current += 1
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current)
      frameTimerRef.current = null
    }
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current)
      connectTimerRef.current = null
    }
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = null
    }
    backloggedSinceRef.current = 0
    // The visible state has to fall back with the ref: a panel still showing "paused" after a
    // new session starts tells the user their screen is private while frames are flowing.
    screenPausedRef.current = false
    setIsScreenPaused(false)
    processorRef.current?.disconnect()
    processorRef.current = null

    void captureContextRef.current?.close().catch(() => {})
    captureContextRef.current = null
    scheduledSourcesRef.current.clear()
    interruptedRef.current = false
    void playbackContextRef.current?.close().catch(() => {})
    playbackContextRef.current = null

    displayStreamRef.current?.getTracks().forEach((track) => track.stop())
    displayStreamRef.current = null
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null

    videoRef.current?.remove()
    videoRef.current = null
    canvasRef.current = null
    previousFrameRef.current = new Uint8ClampedArray()

    const socket = socketRef.current
    socketRef.current = null
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close()
  }, [])

  const endSession = useCallback(
    (reason: 'user_ended' | 'connection_lost' | 'credential_expired') => {
      if (!activeRef.current) return
      activeRef.current = false

      const durationSeconds = startedAtRef.current
        ? Math.round((performance.now() - startedAtRef.current) / 1000)
        : 0
      eventsRef.current?.onSessionEnded?.({
        durationSeconds,
        framesSent: framesSentRef.current,
        reason,
      })

      releaseResources()
      setStatus('ended')
    },
    [releaseResources]
  )

  const failSession = useCallback(
    (code: VoiceSessionErrorCode) => {
      activeRef.current = false
      releaseResources()
      setErrorCode(code)
      setStatus('error')
      setFailureCount((count) => count + 1)
      eventsRef.current?.onSessionFailed?.(code)
    },
    [releaseResources]
  )

  const playAudioDelta = useCallback(
    (base64: string) => {
      const context = playbackContextRef.current
      if (!context) return

      // The payload is provider-controlled: truncated or malformed base64 makes `atob` throw,
      // and an unhandled exception here would silence the agent without ending the session.
      let samples: Float32Array
      try {
        samples = decodeAudioChunk(base64)
      } catch (error) {
        report(error, 'decode-audio-delta')
        return
      }
      if (samples.length === 0) return

      const buffer = context.createBuffer(1, samples.length, REALTIME_SAMPLE_RATE)
      // `copyToChannel` demands a Float32Array backed by a plain ArrayBuffer; writing through
      // the channel view accepts any ArrayLike and sidesteps that narrowing.
      buffer.getChannelData(0).set(samples)

      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      scheduledSourcesRef.current.add(source)
      source.onended = () => scheduledSourcesRef.current.delete(source)

      const startAt = Math.max(context.currentTime, nextPlayTimeRef.current)
      source.start(startAt)
      nextPlayTimeRef.current = startAt + buffer.duration
    },
    [report]
  )

  /** Cuts the agent off mid-sentence: the person speaking outranks whatever it was saying. */
  const stopPlayback = useCallback(() => {
    scheduledSourcesRef.current.forEach((source) => {
      source.onended = null
      try {
        source.stop()
      } catch {
        // Already finished on its own; nothing to cut.
      }
    })
    scheduledSourcesRef.current.clear()
    nextPlayTimeRef.current = 0
  }, [])

  const appendTranscript = useCallback(
    (speaker: 'user' | 'agent', text: string, turnId: string | null) => {
      if (!text) return
      setTranscript((entries) => {
        const last = entries.at(-1)
        if (turnId && last && last.id === turnId && last.speaker === speaker) {
          return [...entries.slice(0, -1), { ...last, text: last.text + text }]
        }
        return [...entries, { id: turnId ?? `${speaker}-${entries.length}`, speaker, text }]
      })
    },
    []
  )

  /**
   * A socket can stay OPEN while the provider receives nothing. Dropping every payload keeps
   * the panel saying "live" with the microphone and monitor still captured, so a backlog that
   * never drains ends the session instead.
   */
  const isSocketWritable = useCallback(
    (socket: WebSocket): boolean => {
      if (socket.bufferedAmount <= MAX_SOCKET_BACKLOG_BYTES) {
        backloggedSinceRef.current = 0
        return true
      }
      const since = backloggedSinceRef.current || performance.now()
      backloggedSinceRef.current = since
      if (performance.now() - since > BACKLOG_DEADLINE_MS) failSession('connection-lost')
      return false
    },
    [failSession]
  )

  /** Returns whether a frame actually went out, which the greeting waits on. */
  const captureAndSendFrame = useCallback((): boolean => {
    const socket = socketRef.current
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !video || !canvas) return false
    // The video element reports no dimensions for the first frames after play() resolves.
    if (!video.videoWidth) return false
    // Paused by the user, typically to type a verification code off-camera.
    if (screenPausedRef.current) return false
    // Frames share the socket with the audio stream, so they honour the same backlog bound;
    // otherwise a stalled connection drops audio while base64 JPEGs keep queueing.
    if (!isSocketWritable(socket)) return false

    const scale = FRAME_WIDTH / video.videoWidth
    canvas.width = FRAME_WIDTH
    canvas.height = Math.round(video.videoHeight * scale)

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return false
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const current = context.getImageData(0, 0, canvas.width, canvas.height).data
    const difference = computeFrameDifference(previousFrameRef.current, current)
    const msSinceLastSent = performance.now() - lastFrameSentAtRef.current

    if (!shouldSendFrame({ difference, msSinceLastSent, threshold: FRAME_DIFF_THRESHOLD }))
      return false

    // `getImageData` already returns an independent snapshot, so copying it again would add a
    // full-frame allocation per sent frame in the middle of an audio-critical session.
    previousFrameRef.current = current
    lastFrameSentAtRef.current = performance.now()
    framesSentRef.current += 1
    socket.send(JSON.stringify(buildScreenFrameItem(canvas.toDataURL('image/jpeg', FRAME_QUALITY))))
    return true
  }, [isSocketWritable])

  /**
   * Greeting waits on the first frame. Asking for it the moment the socket goes live makes the
   * agent open by asking where the user is, when the screen it was just given answers that.
   */
  const greetOnceScreenIsVisible = useCallback(
    (socket: WebSocket) => {
      const deadline = performance.now() + FIRST_FRAME_DEADLINE_MS
      const attempt = () => {
        if (socket.readyState !== WebSocket.OPEN || !liveRef.current) return
        if (captureAndSendFrame() || performance.now() >= deadline) {
          socket.send(JSON.stringify(buildGreetingRequest()))
          return
        }
        window.setTimeout(attempt, FIRST_FRAME_RETRY_MS)
      }
      attempt()
    },
    [captureAndSendFrame]
  )

  const startScreenPipeline = useCallback(
    (stream: MediaStream) => {
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      void video.play().catch(() => {})
      videoRef.current = video
      canvasRef.current = document.createElement('canvas')

      frameTimerRef.current = setInterval(captureAndSendFrame, FRAME_TICK_MS)
    },
    [captureAndSendFrame]
  )

  const startMicPipeline = useCallback(
    (stream: MediaStream) => {
      const context = new AudioContext({ sampleRate: REALTIME_SAMPLE_RATE })
      void context.resume().catch(() => {})
      captureContextRef.current = context

      // Losing the microphone mid-session leaves a one-way call: the agent keeps talking to
      // someone it can no longer hear.
      stream.getAudioTracks()[0]?.addEventListener('ended', () => endSession('user_ended'))

      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (event) => {
        const socket = socketRef.current
        if (!socket || socket.readyState !== WebSocket.OPEN || mutedRef.current) return
        // Audio arrives every few milliseconds whether or not the socket is draining;
        // queueing past this point buys nothing and grows without bound.
        if (!isSocketWritable(socket)) return
        const chunk = event.inputBuffer.getChannelData(0)
        socket.send(JSON.stringify(buildAudioAppend(encodeAudioChunk(chunk, context.sampleRate))))
      }

      // A ScriptProcessorNode only runs while connected to the graph; a muted gain keeps the
      // user from hearing their own microphone.
      const silence = context.createGain()
      silence.gain.value = 0
      source.connect(processor)
      processor.connect(silence)
      silence.connect(context.destination)
    },
    [endSession, isSocketWritable]
  )

  const start = useCallback(async () => {
    if (activeRef.current) return

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      failSession('unsupported-browser')
      return
    }

    setErrorCode(null)
    setErrorDetail(null)
    setTranscript([])
    liveRef.current = false
    mutedRef.current = false
    setIsMuted(false)
    framesSentRef.current = 0
    lastFrameSentAtRef.current = 0
    nextPlayTimeRef.current = 0
    setStatus('requesting-consent')
    eventsRef.current?.onConsentAccepted?.()

    const generation = ++startGenerationRef.current
    const isStale = () => generation !== startGenerationRef.current

    // The microphone is asked for first because Safari only honours getUserMedia while the
    // click that triggered it is still the active user gesture, and awaiting the screen
    // picker spends that gesture — the mic then fails on a device the user had allowed.
    let micStream: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      // A refusal is the person's own decision and not worth reporting; anything else is a
      // fault we would never see otherwise, because the panel only shows a message.
      if (!isMediaRefusal(error)) report(error, 'get-user-media')
      failSession(classifyMediaFailure(error, 'mic-denied', 'mic-unavailable'))
      return
    }
    // Held in the ref before anything else can fail, so every later exit path stops it.
    micStreamRef.current = micStream
    if (isStale()) {
      micStream.getTracks().forEach((track) => track.stop())
      return
    }

    // Stops here deliberately. A browser grants one permission per user gesture, and awaiting
    // the microphone prompt already spent this one — asking for the screen in the same click
    // is rejected without ever showing the picker. The user clicks again.
    setStatus('awaiting-screen')
    // Someone who walks away between the two clicks would otherwise leave the microphone
    // recording behind a panel nobody is watching.
    connectTimerRef.current = setTimeout(() => {
      if (isStale() || activeRef.current) return
      releaseResources()
      setStatus('idle')
    }, AWAITING_SCREEN_DEADLINE_MS)
  }, [failSession, releaseResources, report])

  const shareScreen = useCallback(async () => {
    const micStream = micStreamRef.current
    if (!micStream || activeRef.current) return

    const generation = startGenerationRef.current
    const isStale = () => generation !== startGenerationRef.current

    // The abandonment deadline armed while waiting for this click would otherwise fire mid
    // connection and tear down a session the user just started.
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current)
      connectTimerRef.current = null
    }

    setErrorCode(null)
    setErrorDetail(null)
    setStatus('requesting-consent')

    let displayStream: MediaStream
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        // A preference, not a requirement: asking for `monitor` as a hard constraint makes
        // browsers that cannot honour it reject the call outright instead of prompting.
        video: { displaySurface: 'monitor' },
        audio: false,
      })
    } catch (error) {
      if (!isMediaRefusal(error)) report(error, 'get-display-media')
      failSession(classifyMediaFailure(error, 'screen-denied', 'screen-unavailable'))
      return
    }
    displayStreamRef.current = displayStream
    // Watched from the moment it is granted rather than once the session is live: sharing can
    // be revoked from the browser's own bar while the socket is still being set up, and
    // nothing downstream would notice.
    displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (activeRef.current) {
        endSession('user_ended')
        return
      }
      releaseResources()
      setStatus('idle')
    })
    // Cleanup already ran while the permission prompt was open, so nothing downstream will
    // ever stop these tracks: the stale path has to release what it just acquired.
    if (isStale()) {
      displayStream.getTracks().forEach((track) => track.stop())
      micStream.getTracks().forEach((track) => track.stop())
      return
    }

    // Flows that open a provider popup put the interesting part outside any single tab or
    // window, so a partial share leaves the agent blind exactly where the documented errors
    // happen. Browsers that do not report the surface at all are trusted rather than blocked.
    const surface = displayStream.getVideoTracks()[0]?.getSettings().displaySurface
    if (surface != null && surface !== 'monitor') {
      failSession('partial-screen-share')
      return
    }

    setStatus('connecting')

    let credentials: RealtimeCredentials
    try {
      // The screen and microphone are already live by now, so a stalled route would keep both
      // running behind a panel stuck on "connecting".
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(CONNECT_DEADLINE_MS),
      })
      if (!response.ok) {
        const reason = await readFailureReason(response)
        setErrorDetail(reason)
        report(new Error(`token request failed: ${reason}`), 'token-request')
        failSession('token-request-failed')
        return
      }
      credentials = (await response.json()) as RealtimeCredentials
    } catch (error) {
      setErrorDetail(describeThrownFailure(error))
      report(error, 'token-request')
      failSession('token-request-failed')
      return
    }
    if (isStale()) return

    let socket: WebSocket
    try {
      socket = new WebSocket(
        buildRealtimeUrl(credentials.wsUrl, credentials.model),
        buildRealtimeSubprotocols(credentials.value)
      )
    } catch (error) {
      setErrorDetail(`socket · ${describeThrownFailure(error)}`)
      report(error, 'open-socket')
      failSession('connection-failed')
      return
    }

    socketRef.current = socket
    activeRef.current = true

    // The credential is minted for minutes, but a WebSocket is only authorized at upgrade
    // time: without this the panel could keep streaming the screen and the microphone long
    // after the key it was opened with stopped being valid.
    const expiresInMs = Date.parse(credentials.expiresAt) - Date.now()
    if (Number.isFinite(expiresInMs)) {
      expiryTimerRef.current = setTimeout(
        () => endSession('credential_expired'),
        Math.max(0, expiresInMs)
      )
    }

    // A socket that opens but never completes the handshake would otherwise leave the panel
    // spinning on "connecting" with the screen still shared.
    connectTimerRef.current = setTimeout(() => {
      if (!liveRef.current) {
        setErrorDetail('handshake timeout')
        failSession('connection-failed')
      }
    }, CONNECT_DEADLINE_MS)

    socket.addEventListener('message', (event) => {
      const payload = parseRealtimeEvent(event.data as string)
      if (!payload) return

      if (payload.type === 'session.created') {
        socket.send(
          JSON.stringify(
            buildSessionUpdate(buildSystemInstruction(playbook), credentials.transcriptionModel, {
              voice: credentials.voice,
              language: playbook.locale,
              transcriptionHint,
            })
          )
        )
        return
      }

      if (payload.type === 'session.updated') {
        if (!liveRef.current) {
          // The session counts as live only once the audio and screen pipelines are actually
          // running; a context the browser refuses to create would otherwise leave the panel
          // connecting forever with the deadline already cleared.
          try {
            const playback = new AudioContext({ sampleRate: REALTIME_SAMPLE_RATE })
            // Several browsers hand back a suspended context once the user gesture that
            // started the session is no longer the current task; without this it is mute.
            void playback.resume().catch(() => {})
            playbackContextRef.current = playback
            startMicPipeline(micStream)
            startScreenPipeline(displayStream)
          } catch (error) {
            setErrorDetail(`audio pipeline · ${describeThrownFailure(error)}`)
            report(error, 'audio-pipeline')
            failSession('connection-failed')
            return
          }

          liveRef.current = true
          if (connectTimerRef.current) {
            clearTimeout(connectTimerRef.current)
            connectTimerRef.current = null
          }
          startedAtRef.current = performance.now()
          setFailureCount(0)
          setStatus('live')
          eventsRef.current?.onSessionStarted?.()
          greetOnceScreenIsVisible(socket)
        }
        return
      }

      // Checked before anything else: yielding late is the same as not yielding. The socket
      // guard keeps a late event from a replaced connection out of the new session's audio.
      if (isUserSpeechStarted(payload)) {
        if (socketRef.current === socket) {
          interruptedRef.current = true
          stopPlayback()
        }
        return
      }

      // The provider keeps streaming for a moment after it hears the user, so the deltas
      // already in flight would be scheduled right back after the cut and the agent would
      // talk on. Only a new response lifts the block.
      if (isResponseStarted(payload)) {
        if (socketRef.current === socket) interruptedRef.current = false
        return
      }

      if (isAudioDelta(payload) && payload.delta) {
        if (!interruptedRef.current) playAudioDelta(payload.delta)
        return
      }

      if (isAgentTranscriptDelta(payload) && payload.delta) {
        agentTurnRef.current ??= `agent-${Date.now()}`
        appendTranscript('agent', payload.delta, agentTurnRef.current)
        return
      }

      if (isAgentTranscriptDone(payload)) {
        agentTurnRef.current = null
        return
      }

      if (isUserTranscriptDone(payload) && payload.transcript) {
        appendTranscript('user', payload.transcript, `user-${Date.now()}`)
        return
      }

      if (payload.type === 'error') {
        const reason = payload.error?.code ?? payload.error?.message ?? 'unknown'
        report(new Error(`realtime error: ${reason}`), 'realtime')
        // Before the session goes live an error is terminal: nothing else will arrive, and
        // without this the panel waits on a handshake that already failed.
        if (!liveRef.current) {
          setErrorDetail(`realtime · ${reason}`)
          failSession('connection-failed')
        }
      }
    })

    socket.addEventListener('error', () => {
      if (activeRef.current) failSession('connection-lost')
    })

    socket.addEventListener('close', (event) => {
      if (activeRef.current) {
        setErrorDetail(`socket closed · ${event.code}${event.reason ? ` ${event.reason}` : ''}`)
        failSession('connection-lost')
      }
    })
  }, [
    appendTranscript,
    endSession,
    failSession,
    greetOnceScreenIsVisible,
    playAudioDelta,
    playbook,
    releaseResources,
    report,
    startMicPipeline,
    startScreenPipeline,
    stopPlayback,
    tokenEndpoint,
    transcriptionHint,
  ])

  const toggleScreenPause = useCallback(() => {
    const next = !screenPausedRef.current
    screenPausedRef.current = next
    setIsScreenPaused(next)
  }, [])

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    setIsMuted(next)

    const socket = socketRef.current
    if (next && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(buildAudioBufferClear()))
    }
  }, [])

  const stop = useCallback(() => {
    // Between the two permission clicks there is no session to report as ended, but the
    // microphone is already open — closing the panel has to release it all the same, and
    // bumping the generation abandons a request still waiting on a prompt.
    if (!activeRef.current) {
      startGenerationRef.current += 1
      releaseResources()
      setStatus('idle')
      return
    }
    endSession('user_ended')
  }, [endSession, releaseResources])

  const reset = useCallback(() => {
    setStatus('idle')
    setErrorCode(null)
    setErrorDetail(null)
    setTranscript([])
  }, [])

  const endSessionRef = useRef(endSession)
  useEffect(() => {
    endSessionRef.current = endSession
  }, [endSession])

  // Navigating away mid-session is still an ended session: without this the socket and the
  // screen share would be torn down with no Ended event ever recorded.
  useEffect(
    () => () => {
      endSessionRef.current('user_ended')
      releaseResources()
    },
    [releaseResources]
  )

  return {
    status,
    errorCode,
    errorDetail,
    transcript,
    isLive: status === 'live',
    isMuted,
    isScreenPaused,
    shouldOfferHumanHelp: failureCount >= FAILURES_BEFORE_HUMAN_HELP,
    start,
    shareScreen,
    stop,
    reset,
    toggleMute,
    toggleScreenPause,
  }
}

export type VoiceSession = ReturnType<typeof useVoiceSession>
