'use client'

import { useEffect, useRef } from 'react'

import type { PlaybookLocale, VoiceSessionErrorCode } from '../types'
import type { VoiceSession } from '../hooks/use-voice-session'
import { PANEL_COPY } from './panel-copy'

interface Props {
  /** Owned by the caller so opening the panel and asking for the microphone share one click. */
  session: VoiceSession
  locale: PlaybookLocale
  onClose: () => void
  /** Rendered when repeated failures mean the user should talk to a person instead. */
  humanHelpSlot?: React.ReactNode
}

export function VoicePanel({ session, locale, onClose, humanHelpSlot }: Props) {
  const copy = PANEL_COPY[locale]
  const {
    status,
    errorCode,
    errorDetail,
    transcript,
    isLive,
    isMuted,
    isScreenPaused,
    shouldOfferHumanHelp,
    start,
    shareScreen,
    stop,
    reset,
    toggleMute,
    toggleScreenPause,
  } = session

  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  // A spoken conversation only reads correctly at its newest turn, and deltas append several
  // times a second, so following the tail cannot be left to the user.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: 'end' })
  }, [transcript])

  return (
    <aside
      // Docked rather than modal: the user has to keep operating the screen the agent is
      // watching, so this must never trap focus or block what is behind it.
      className="yv-panel"
      aria-label={copy.title}
    >
      <header className="yv-panel-header">
        <div>
          <h3 className="yv-panel-title">{copy.title}</h3>
          {isLive ? (
            <p className="yv-panel-status">
              <span className={isMuted ? 'yv-dot yv-dot-muted' : 'yv-dot yv-dot-live'} />
              {isMuted ? copy.muted : copy.live}
            </p>
          ) : (
            <p className="yv-muted">{copy.subtitle}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="yv-close" aria-label={copy.close}>
          ✕
        </button>
      </header>

      <div className="yv-panel-body">
        {status === 'idle' && (
          <div className="yv-stack">
            <div className="yv-card">
              <p>{copy.consentBody}</p>
              <ul className="yv-list">
                <li>{copy.consentScreen}</li>
                <li>{copy.consentMic}</li>
              </ul>
            </div>
            <button type="button" onClick={start} className="yv-button yv-button-primary">
              {copy.ctaStart}
            </button>
          </div>
        )}

        {status === 'awaiting-screen' && (
          <div className="yv-stack">
            <div className="yv-card">
              <p className="yv-strong">{copy.micReady}</p>
              <p className="yv-muted">{copy.shareScreenBody}</p>
            </div>
            <button type="button" onClick={shareScreen} className="yv-button yv-button-primary">
              {copy.ctaShareScreen}
            </button>
          </div>
        )}

        {(status === 'requesting-consent' || status === 'connecting') && (
          <p className="yv-muted">{copy.connecting}</p>
        )}

        {isLive &&
          (transcript.length === 0 ? (
            <p className="yv-muted">{copy.transcriptEmpty}</p>
          ) : (
            // Speech carries whatever was said out loud — names, phone numbers, whatever is
            // on the screen being read. If your analytics autocaptures the DOM, none of it
            // belongs in a session replay: this is where you opt the subtree out.
            <div className="yv-transcript" data-analytics-no-capture>
              {transcript.map((entry) => (
                <div
                  key={entry.id}
                  className={entry.speaker === 'agent' ? 'yv-turn-agent' : 'yv-turn-user'}
                >
                  <p className="yv-bubble">
                    <span className="yv-sr-only">
                      {entry.speaker === 'agent' ? copy.speakerAgent : copy.speakerUser}:{' '}
                    </span>
                    {entry.text}
                  </p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          ))}

        {status === 'error' && (
          <div className="yv-stack">
            <div className="yv-alert">
              <p>{copy.errors[errorCode ?? 'connection-failed']}</p>
              {errorDetail && <p className="yv-detail">{errorDetail}</p>}
            </div>
            {shouldOfferHumanHelp ? (
              // Repeated failures must never dead-end.
              (humanHelpSlot ?? <p className="yv-muted">{copy.humanHelpFallback}</p>)
            ) : (
              <button type="button" onClick={reset} className="yv-button">
                {copy.ctaRetry}
              </button>
            )}
          </div>
        )}

        {status === 'ended' && (
          <div className="yv-stack">
            <p className="yv-muted">{copy.ended}</p>
            <button type="button" onClick={reset} className="yv-button">
              {copy.ctaRestart}
            </button>
          </div>
        )}
      </div>

      {isLive && (
        <footer className="yv-panel-footer">
          <div className="yv-row">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={isMuted}
              className="yv-button yv-grow"
            >
              {isMuted ? copy.ctaUnmute : copy.ctaMute}
            </button>
            <button
              type="button"
              onClick={toggleScreenPause}
              aria-pressed={isScreenPaused}
              className="yv-button yv-grow"
            >
              {isScreenPaused ? copy.ctaResumeScreen : copy.ctaPauseScreen}
            </button>
          </div>
          <button type="button" onClick={stop} className="yv-button yv-button-block">
            {copy.ctaEnd}
          </button>
          <p className="yv-hint">{isScreenPaused ? copy.screenPausedHint : copy.muteHint}</p>
        </footer>
      )}
    </aside>
  )
}

export type { VoiceSessionErrorCode }
