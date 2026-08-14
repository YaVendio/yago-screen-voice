import { NextResponse, after } from 'next/server'

import type { VoiceOutageReason } from '@/voice/lib/outage-alert'
import { alertVoiceOutage } from '@/voice/lib/outage-alert'

const DEFAULT_DURATION = '30m'
const DEFAULT_BUDGET = 1
const MAX_BUDGET = 5
/** Anything longer would hand the browser a credential that outlives the session it is for. */
const MAX_DURATION_MINUTES = 60
const MIN_DURATION_MINUTES = 1
const DURATION_PATTERN = /^(\d+)(s|m|h)$/
const UPSTREAM_TIMEOUT_MS = 10_000
/** Best-effort, per-instance. Replace the key with your own user/tenant id. */
const MINT_COOLDOWN_MS = 5_000
const MAX_CREDENTIAL_LENGTH = 512
/** A minted credential envelope is a few hundred bytes; anything larger is not one. */
const MAX_UPSTREAM_BODY_BYTES = 64 * 1024

const lastMintByCaller = new Map<string, number>()

/**
 * Only an absent value takes the default. A present but unusable one is a deployment mistake,
 * and silently substituting it would hand back a credential that does not match what the
 * operator asked for.
 */
function resolveDuration(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') return DEFAULT_DURATION
  const match = DURATION_PATTERN.exec(raw)
  if (!match) return null

  const amount = Number(match[1])
  const minutes = match[2] === 's' ? amount / 60 : match[2] === 'h' ? amount * 60 : amount
  if (!Number.isFinite(minutes)) return null
  // Shorter than the handshake deadline and the credential can expire before the socket
  // finishes opening.
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) return null
  return raw
}

function resolveBudget(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return DEFAULT_BUDGET
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_BUDGET) return null
  return parsed
}

/**
 * Every session's credential and audio travel to this host, so a blank or plaintext value
 * would put both in the clear. Loopback stays allowed so local development still works.
 */
function resolveProxyUrl(raw: string | undefined): URL | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback)) return url
  return null
}

/** Blank-but-present configuration is a deployment mistake, not an unset default. */
function requireConfigured(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}

/**
 * The client stops the session on this timestamp, so an absent or already-past value would
 * leave a billed credential running with nothing watching its lifetime.
 */
function resolveExpiry(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const at = Date.parse(raw)
  if (!Number.isFinite(at) || at <= Date.now()) return null
  return new Date(at).toISOString()
}

function resolveWebSocketUrl(proxyUrl: string): string {
  const url = new URL('/v1/realtime', proxyUrl)
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
  return url.toString()
}

/**
 * The credential is handed to the browser as a WebSocket subprotocol, whose value must be an
 * HTTP token: a key containing a space or a separator would make the constructor throw instead
 * of opening the session, so it is rejected here rather than in the browser.
 */
const HTTP_TOKEN_PATTERN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/

function isUsableCredential(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CREDENTIAL_LENGTH &&
    HTTP_TOKEN_PATTERN.test(value)
  )
}

/**
 * The alert must not delay the error response, but a bare floating promise can be frozen with
 * the serverless instance the moment the response is sent, losing the very alert an outage
 * depends on. `after` keeps it attached to the request.
 */
function reportOutage(reason: VoiceOutageReason, context?: { status?: number }): void {
  try {
    after(() => alertVoiceOutage(reason, context))
  } catch {
    void alertVoiceOutage(reason, context)
  }
}

/**
 * Mints the short-lived credential the browser opens the realtime socket with.
 *
 * The browser WebSocket cannot send an Authorization header, so whatever this returns is
 * visible to the client. It is therefore never the proxy's long-lived key but a per-session
 * virtual key: minutes-long, budget-capped, and restricted to the realtime model alone.
 *
 * ── Before you deploy this ──────────────────────────────────────────────────────────────
 * This route spends money on every call. In this demo it is open, because the demo has no
 * users. In your app it MUST NOT be:
 *
 *   1. Authenticate the caller and refuse anonymous requests.
 *   2. Key the cooldown below on that caller's id, not on a shared bucket.
 *   3. If the feature is behind a flag or an experiment, decide the arm HERE too. The
 *      browser's own assignment is not an authorization boundary, and it must fail closed —
 *      an unreadable assignment must not become a free credential.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
export async function POST(request: Request) {
  const mode = process.env.VOICE_MODE ?? 'litellm'

  // Rate limit before any upstream call, so a hammered endpoint costs nothing.
  const callerId = request.headers.get('x-forwarded-for') ?? 'local'
  const lastMint = lastMintByCaller.get(callerId)
  if (lastMint != null && Date.now() - lastMint < MINT_COOLDOWN_MS) {
    return NextResponse.json({ error: 'too many credential requests' }, { status: 429 })
  }
  lastMintByCaller.set(callerId, Date.now())

  const model = requireConfigured(process.env.VOICE_REALTIME_MODEL)
  const transcriptionModel = requireConfigured(process.env.VOICE_TRANSCRIPTION_MODEL)
  if (!model || !transcriptionModel) {
    return NextResponse.json({ error: 'realtime models not configured' }, { status: 500 })
  }
  const voice = requireConfigured(process.env.VOICE_NAME) ?? undefined

  if (mode === 'direct') {
    // No minting step exists here: the key is handed to the browser as-is. That is only ever
    // acceptable on a machine the developer owns, so it takes an explicit opt-in and is
    // refused outright in a production build.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'direct mode is not allowed in production' }, { status: 500 })
    }
    if (process.env.VOICE_ALLOW_INSECURE_DIRECT_KEY !== 'true') {
      return NextResponse.json(
        { error: 'direct mode requires VOICE_ALLOW_INSECURE_DIRECT_KEY=true' },
        { status: 500 }
      )
    }

    const apiKey = requireConfigured(process.env.VOICE_API_KEY)
    const wsUrl = requireConfigured(process.env.VOICE_REALTIME_URL)
    if (!apiKey || !wsUrl) {
      return NextResponse.json({ error: 'direct mode not configured' }, { status: 500 })
    }
    if (!isUsableCredential(apiKey)) {
      return NextResponse.json({ error: 'api key is not a usable subprotocol value' }, { status: 500 })
    }

    return NextResponse.json(
      {
        value: apiKey,
        model,
        transcriptionModel,
        voice,
        wsUrl,
        // There is nothing to expire, so the client's own lifetime cap is what bounds the
        // session. Keep it short: it is the only thing stopping an idle tab from streaming
        // a microphone and a monitor for an afternoon.
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } }
    )
  }

  const proxyUrl = resolveProxyUrl(process.env.LITELLM_PROXY_URL)
  const masterKey = requireConfigured(process.env.LITELLM_MASTER_KEY)
  if (!proxyUrl || !masterKey) {
    return NextResponse.json({ error: 'realtime proxy not configured' }, { status: 500 })
  }

  const duration = resolveDuration(process.env.VOICE_KEY_DURATION)
  const maxBudget = resolveBudget(process.env.VOICE_KEY_BUDGET)
  if (duration === null || maxBudget === null) {
    return NextResponse.json({ error: 'realtime guardrails misconfigured' }, { status: 500 })
  }

  let upstream: Response
  try {
    upstream = await fetch(new URL('/key/generate', proxyUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${masterKey}`, 'content-type': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      body: JSON.stringify({
        models: [model],
        duration,
        max_budget: maxBudget,
        key_alias: `voice-${crypto.randomUUID()}`,
        metadata: { feature: 'voice-screen-agent' },
      }),
    })
  } catch {
    reportOutage('proxy-unreachable')
    return NextResponse.json({ error: 'realtime proxy unreachable' }, { status: 502 })
  }

  if (!upstream.ok) {
    // The upstream body can echo the master key back in an error envelope, so it is dropped.
    reportOutage('credential-rejected', { status: upstream.status })
    return NextResponse.json({ error: 'realtime credential rejected' }, { status: 502 })
  }

  let minted: unknown
  try {
    // Read as text with a ceiling first: `json()` on an unbounded body would let a broken or
    // hostile proxy decide how much memory this server spends parsing its answer.
    const body = await upstream.text()
    if (body.length > MAX_UPSTREAM_BODY_BYTES) {
      reportOutage('credential-oversized')
      return NextResponse.json({ error: 'realtime credential oversized' }, { status: 502 })
    }
    minted = JSON.parse(body)
  } catch {
    reportOutage('credential-unreadable')
    return NextResponse.json({ error: 'realtime credential unreadable' }, { status: 502 })
  }

  const value = (minted as { key?: unknown } | null)?.key
  if (!isUsableCredential(value)) {
    reportOutage('credential-missing')
    return NextResponse.json({ error: 'realtime credential missing' }, { status: 502 })
  }
  // A proxy that echoes the operator key back instead of minting one would otherwise hand the
  // long-lived credential straight to the browser, which is the single thing this route exists
  // to prevent.
  if (value === masterKey) {
    reportOutage('credential-echoed')
    return NextResponse.json({ error: 'realtime credential rejected' }, { status: 502 })
  }

  const expiresAt = resolveExpiry((minted as { expires?: unknown }).expires)
  if (!expiresAt) {
    reportOutage('expiry-missing')
    return NextResponse.json({ error: 'realtime credential expiry missing' }, { status: 502 })
  }

  return NextResponse.json(
    {
      value,
      model,
      transcriptionModel,
      voice,
      wsUrl: resolveWebSocketUrl(proxyUrl.toString()),
      expiresAt,
    },
    { headers: { 'cache-control': 'no-store' } }
  )
}
