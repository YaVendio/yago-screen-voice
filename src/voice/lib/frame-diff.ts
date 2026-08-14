/** Fraction of sampled pixels that must change before a frame is worth sending. */
export const FRAME_DIFF_THRESHOLD = 0.02

/** Never send frames closer together than this, however much the screen moves. */
export const MIN_FRAME_INTERVAL_MS = 2000

/** Send a keepalive frame at least this often so the model does not go blind while idle. */
export const MAX_FRAME_INTERVAL_MS = 15000

/** Per-pixel channel delta above which a sampled pixel counts as changed. */
const CHANNEL_DELTA_THRESHOLD = 12

/**
 * Fraction of sampled pixels that differ between two RGBA buffers, sampling every
 * `step`-th pixel so a full-screen frame stays cheap to compare.
 *
 * The step must be coprime with the frame width, or every sample lands on the same handful
 * of columns and anything between them — a checkbox, a caret, a status dot — never registers.
 * 17 is prime, so it walks across all columns of any width that is not a multiple of it.
 */
export function computeFrameDifference(
  previous: Uint8ClampedArray,
  current: Uint8ClampedArray,
  step = 17
): number {
  if (previous.length === 0 || previous.length !== current.length) return 1

  let sampled = 0
  let changed = 0

  for (let i = 0; i < current.length; i += 4 * step) {
    sampled++
    const delta =
      Math.abs(current[i] - previous[i]) +
      Math.abs(current[i + 1] - previous[i + 1]) +
      Math.abs(current[i + 2] - previous[i + 2])
    if (delta > CHANNEL_DELTA_THRESHOLD) changed++
  }

  return sampled === 0 ? 0 : changed / sampled
}

export interface FrameDecisionInput {
  difference: number
  msSinceLastSent: number
  threshold?: number
  minIntervalMs?: number
  maxIntervalMs?: number
}

/** Rate-limits screen frames: enough to follow the user, few enough to stay cheap. */
export function shouldSendFrame({
  difference,
  msSinceLastSent,
  threshold = FRAME_DIFF_THRESHOLD,
  minIntervalMs = MIN_FRAME_INTERVAL_MS,
  maxIntervalMs = MAX_FRAME_INTERVAL_MS,
}: FrameDecisionInput): boolean {
  if (msSinceLastSent < minIntervalMs) return false
  if (msSinceLastSent >= maxIntervalMs) return true
  return difference >= threshold
}
