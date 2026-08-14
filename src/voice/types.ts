export type PlaybookLocale = 'es' | 'en' | 'pt'

export interface ConnectionOption {
  id: string
  name: string
  whenToChoose: string
  /** The screens of this path in order, one instruction each. */
  steps: string[]
}

/** The full reset run when someone who set this up before cannot do it again. */
export interface RecoveryProcedure {
  title: string
  whenToRun: string
  steps: string[]
}

/** What the agent is allowed to talk about at all. */
export interface PlaybookScope {
  allowed: string[]
  refusal: string
}

export type ProblemKind = 'setup' | 'error'

export interface PlaybookProblem {
  id: string
  kind: ProblemKind
  title: string
  /** Verbatim text the user sees, used to recognize the problem from a screen frame. */
  signals: string[]
  solution: string
}

/**
 * The whole knowledge base of the agent, as data rather than a string.
 *
 * Written as a structure so a support person can extend it without touching a prompt, and
 * so the same knowledge renders differently per locale without being translated twice.
 */
export interface Playbook {
  locale: PlaybookLocale
  /** Who the agent is, in one or two sentences. */
  role: string
  scope: PlaybookScope
  /** The screens every path shares before the user picks one. */
  entrySteps: string[]
  options: ConnectionOption[]
  /** The screens every path shares once the hard part is done. */
  finishSteps: string[]
  recovery: RecoveryProcedure
  problems: PlaybookProblem[]
  escalation: string
  /**
   * Rules that only make sense for this playbook — what the agent may tell someone to
   * delete, how hard it may push on a failed attempt. Merged after the shared conduct.
   */
  conduct?: string[]
  /** First thing the agent does, before saying anything: names the screens it might see. */
  opening: string
}

export type VoiceSessionStatus =
  | 'idle'
  /** Microphone granted, waiting on the second click that is allowed to ask for the screen. */
  | 'awaiting-screen'
  | 'requesting-consent'
  | 'connecting'
  | 'live'
  | 'ended'
  | 'error'

export type VoiceSessionErrorCode =
  | 'mic-denied'
  | 'mic-unavailable'
  | 'screen-denied'
  | 'screen-unavailable'
  | 'partial-screen-share'
  | 'token-request-failed'
  | 'connection-failed'
  | 'connection-lost'
  | 'unsupported-browser'

export type VoiceSessionEndReason = 'user_ended' | 'connection_lost' | 'credential_expired'

export interface TranscriptEntry {
  id: string
  speaker: 'user' | 'agent'
  text: string
}

export interface RealtimeCredentials {
  value: string
  model: string
  transcriptionModel: string
  /** Absent when the deployment has not chosen one, and the built-in default applies. */
  voice?: string
  wsUrl: string
  expiresAt: string
}

/**
 * Everything worth measuring about a session. Wire it to your analytics; the hook calls it
 * and does not care what happens next.
 */
export interface VoiceSessionEvents {
  onConsentAccepted?: () => void
  onSessionStarted?: () => void
  onSessionEnded?: (info: {
    durationSeconds: number
    framesSent: number
    reason: VoiceSessionEndReason
  }) => void
  onSessionFailed?: (code: VoiceSessionErrorCode) => void
  /** Faults worth reporting. Permission refusals are not passed here — those are a choice. */
  onError?: (error: unknown, context: string) => void
}
