import type { VoiceSessionErrorCode } from '../types'

/** Rejections that mean the user, or a browser policy, refused — not a failing device. */
const REFUSAL_ERROR_NAMES = new Set([
  'NotAllowedError',
  'SecurityError',
  'PermissionDeniedError',
  // Every browser reports a cancelled picker differently; a cancel is still a refusal.
  'AbortError',
])

/**
 * Every media failure arrives as the same rejected promise, so the reason has to be read off
 * the exception's name. Collapsing them all into "grant permission" is what makes an already
 * allowed microphone report a permissions problem, and it sends the user to a settings screen
 * where nothing is wrong.
 */
export function classifyMediaFailure(
  error: unknown,
  refused: VoiceSessionErrorCode,
  unavailable: VoiceSessionErrorCode
): VoiceSessionErrorCode {
  const name = error instanceof DOMException ? error.name : ''
  return REFUSAL_ERROR_NAMES.has(name) ? refused : unavailable
}

/** A refusal is the user's own choice; anything else is a fault worth reporting. */
export function isMediaRefusal(error: unknown): boolean {
  return error instanceof DOMException && REFUSAL_ERROR_NAMES.has(error.name)
}
