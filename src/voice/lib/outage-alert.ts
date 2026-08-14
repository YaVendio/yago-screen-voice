/**
 * Upstream refusals that mean the feature is down for everyone, not that one person hit a bad
 * moment: an exhausted budget, a rejected operator key, a proxy that stopped answering.
 * Nobody using the app can act on any of them, so they belong on a channel a human watches.
 */
export type VoiceOutageReason =
  | 'credential-rejected'
  | 'proxy-unreachable'
  | 'credential-oversized'
  | 'credential-unreadable'
  | 'credential-echoed'
  | 'credential-missing'
  | 'expiry-missing'

const REASON_TEXT: Record<VoiceOutageReason, string> = {
  'credential-rejected':
    'the proxy refused to mint a credential — the operator key may be rotated, revoked, or out of budget',
  'proxy-unreachable': 'the proxy did not answer in time',
  'credential-oversized': 'the proxy answered with a body too large to be a credential',
  'credential-unreadable': 'the proxy answered with something that is not JSON',
  'credential-echoed':
    'the proxy echoed the operator key back instead of minting a session credential',
  'credential-missing': 'the proxy answered without a credential',
  'expiry-missing': 'the proxy minted a credential without a usable expiry',
}

/**
 * One alert per reason per window. Everyone on the screen hits the same wall within seconds of
 * an outage, and a channel buried under identical messages gets muted, which costs more than
 * the alert buys.
 */
const ALERT_COOLDOWN_MS = 15 * 60_000
const lastAlertByReason = new Map<VoiceOutageReason, number>()

function shouldSend(reason: VoiceOutageReason, now: number): boolean {
  const last = lastAlertByReason.get(reason)
  if (last != null && now - last < ALERT_COOLDOWN_MS) return false
  lastAlertByReason.set(reason, now)
  return true
}

/**
 * The window is claimed before the request goes out, so a delivery that fails has to give it
 * back — otherwise one unlucky moment silences the channel for the rest of the outage.
 */
function releaseWindow(reason: VoiceOutageReason): void {
  lastAlertByReason.delete(reason)
}

/**
 * Never throws and never blocks the caller: an alert that fails must not turn a degraded
 * feature into a broken request.
 */
export async function alertVoiceOutage(
  reason: VoiceOutageReason,
  context: { status?: number; detail?: string } = {}
): Promise<void> {
  const webhook = process.env.VOICE_ALERT_WEBHOOK_URL?.trim()
  if (!webhook || !shouldSend(reason, Date.now())) return

  const status = context.status ? ` (HTTP ${context.status})` : ''
  const detail = context.detail ? `\n> ${context.detail}` : ''
  const text = `:red_circle: *Voice agent — sessions are down*\n${REASON_TEXT[reason]}${status}.${detail}\nAnyone opening the assistant gets an error. Muted ${ALERT_COOLDOWN_MS / 60_000} min for this reason.`

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3_000),
    })
    // Slack answers 200 with a body on success and a plain 4xx on a revoked or malformed hook;
    // without this check a dead webhook reads as a delivered alert.
    if (!response.ok) throw new Error(`webhook responded ${response.status}`)
  } catch {
    releaseWindow(reason)
  }
}
