import { REALTIME_SAMPLE_RATE } from './pcm-audio'

/** Fallback voice when the deployment does not name one. */
export const DEFAULT_VOICE = 'cedar'

/**
 * Low detail downsamples the frame before the model ever sees it, which is fine for a banner
 * and useless for a button label — the user is asked to click things by name, so the names
 * have to survive. High detail costs more per frame; the rate limiter is what keeps that bounded.
 */
const FRAME_DETAIL = 'high'

/**
 * How readily the model takes its turn. Low makes it wait through the pauses a person
 * leaves mid-sentence instead of answering a half-finished thought.
 */
const TURN_EAGERNESS = 'low'

/**
 * Above this many bytes still queued on the socket the connection is not keeping up, and
 * appending more audio only grows a backlog the user is already ahead of.
 */
export const MAX_SOCKET_BACKLOG_BYTES = 512 * 1024

/**
 * The browser WebSocket cannot send an Authorization header, so the credential travels as a
 * subprotocol. It is a short-lived, budget-capped, single-model key minted per session.
 */
export function buildRealtimeSubprotocols(credential: string): string[] {
  return ['realtime', `openai-insecure-api-key.${credential}`, 'openai-beta.realtime-v1']
}

export function buildRealtimeUrl(wsUrl: string, model: string): string {
  const url = new URL(wsUrl)
  url.searchParams.set('model', model)
  return url.toString()
}

export interface SessionUpdateOptions {
  voice?: string
  language?: string
  /**
   * Terms this conversation is full of and that a general model mishears. The transcription
   * model accepts a prompt as a decoding bias, which is the difference between a product
   * name and the everyday words it sounds like.
   */
  transcriptionHint?: string
}

export function buildSessionUpdate(
  instructions: string,
  transcriptionModel: string,
  options: SessionUpdateOptions = {}
) {
  return {
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions,
      output_modalities: ['audio'],
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: REALTIME_SAMPLE_RATE },
          turn_detection: {
            type: 'semantic_vad',
            eagerness: TURN_EAGERNESS,
            // The person always outranks the agent: starting to speak cancels whatever it
            // is saying instead of the two talking over each other.
            interrupt_response: true,
          },
          // Without this the user's own turns never come back as text and the panel shows a
          // one-sided transcript. The language is stated rather than detected: left to
          // itself the model re-detects every turn, and a short phrase in one language
          // regularly comes back decoded as another.
          transcription: {
            model: transcriptionModel,
            language: options.language ?? 'es',
            prompt: options.transcriptionHint,
          },
        },
        output: {
          format: { type: 'audio/pcm', rate: REALTIME_SAMPLE_RATE },
          voice: options.voice || DEFAULT_VOICE,
        },
      },
    },
  }
}

export function buildAudioAppend(base64Pcm: string) {
  return { type: 'input_audio_buffer.append', audio: base64Pcm }
}

/** Drops whatever half-sentence was already buffered so muting takes effect immediately. */
export function buildAudioBufferClear() {
  return { type: 'input_audio_buffer.clear' }
}

/**
 * Screen frames enter as a plain user item so they join the context without forcing a reply —
 * responses stay driven by the user's voice, not by every repaint.
 */
export function buildScreenFrameItem(dataUrl: string) {
  return {
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_image', image_url: dataUrl, detail: FRAME_DETAIL }],
    },
  }
}

export function buildGreetingRequest() {
  return { type: 'response.create' }
}

export interface RealtimeEvent {
  type: string
  delta?: string
  transcript?: string
  error?: { message?: string; code?: string }
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Validates a frame instead of trusting it: valid JSON is not the same as a realtime event,
 * and a field typed as text here reaches React state. `null`, a bare array, or a transcript
 * that is an object all arrive over the wire as valid JSON.
 */
export function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.type !== 'string') return null

  const rawError = candidate.error
  const error =
    typeof rawError === 'object' && rawError !== null && !Array.isArray(rawError)
      ? {
          message: asOptionalString((rawError as Record<string, unknown>).message),
          code: asOptionalString((rawError as Record<string, unknown>).code),
        }
      : undefined

  return {
    type: candidate.type,
    delta: asOptionalString(candidate.delta),
    transcript: asOptionalString(candidate.transcript),
    error,
  }
}

/** The provider heard the user start talking — the moment the agent has to yield. */
export function isUserSpeechStarted(event: RealtimeEvent): boolean {
  return event.type === 'input_audio_buffer.speech_started'
}

/** A fresh answer begins here, which is what makes an earlier interruption stop applying. */
export function isResponseStarted(event: RealtimeEvent): boolean {
  return event.type === 'response.created'
}

export function isAudioDelta(event: RealtimeEvent): boolean {
  return event.type === 'response.output_audio.delta'
}

export function isAgentTranscriptDelta(event: RealtimeEvent): boolean {
  return event.type === 'response.output_audio_transcript.delta'
}

export function isAgentTranscriptDone(event: RealtimeEvent): boolean {
  return event.type === 'response.output_audio_transcript.done'
}

export function isUserTranscriptDone(event: RealtimeEvent): boolean {
  return event.type === 'conversation.item.input_audio_transcription.completed'
}
