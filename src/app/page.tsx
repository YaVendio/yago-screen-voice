'use client'

import { useEffect, useState } from 'react'

import { EXAMPLE_PLAYBOOK } from '@/playbooks/example-playbook'
import { VoicePanel } from '@/voice/components/voice-panel'
import { useVoiceSession } from '@/voice/hooks/use-voice-session'

/**
 * Terms this flow is full of that a general transcription model mishears. Yours will be your
 * product names and whatever your users say out loud that is not a common word.
 */
const TRANSCRIPTION_HINT = 'Acme, Acme Pay, RUC, cuenta corriente, cuenta de ahorros'

export default function DemoPage() {
  const [isSupported, setIsSupported] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  // Held above the panel so opening and starting happen in the same click: a browser only
  // honours a permission request while the gesture that caused it is still active, and
  // mounting the panel first would spend it before the hook existed.
  const session = useVoiceSession({
    playbook: EXAMPLE_PLAYBOOK,
    transcriptionHint: TRANSCRIPTION_HINT,
    events: {
      // Wire these to your analytics. The hook does not care what happens next.
      onSessionStarted: () => console.info('[voice] session started'),
      onSessionEnded: (info) => console.info('[voice] session ended', info),
      onSessionFailed: (code) => console.warn('[voice] session failed', code),
      onError: (error, context) => console.error(`[voice] ${context}`, error),
    },
  })

  // Screen sharing has no mobile equivalent, and capability is only knowable after mount, so
  // deciding this during render would desync the server-rendered HTML.
  useEffect(() => {
    setIsSupported(
      typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
    )
  }, [])

  const handleOpen = () => {
    setIsOpen(true)
    // `start` reaches getUserMedia before its first await, so this stays inside the click.
    void session.start()
  }

  const handleClose = () => {
    session.stop()
    session.reset()
    setIsOpen(false)
  }

  return (
    <main className={isOpen ? 'demo-main demo-main-docked' : 'demo-main'}>
      <div className="demo-content">
        <header className="demo-header">
          <p className="demo-eyebrow">Demo</p>
          <h1>Un asistente de voz que ve tu pantalla</h1>
          <p className="demo-lede">
            Abajo hay una pantalla de conexión de mentira, de un producto que no existe. El
            asistente no sabe nada de ella salvo lo que dice su playbook — el mismo mecanismo
            que usamos en producción para guiar a un vendedor a conectar su WhatsApp.
          </p>
        </header>

        <section className="demo-steps">
          <h2>Cómo probarlo</h2>
          <ol>
            <li>Pulsa «Hablar con el asistente». El navegador pide el micrófono.</li>
            <li>
              Pulsa «Compartir pantalla» y elige <strong>toda la pantalla</strong>. Una pestaña
              o una ventana no sirve, a propósito: en el flujo real los pasos ocurren en un
              popup que vive fuera de la pestaña.
            </li>
            <li>Espera. El asistente mira primero y saluda diciéndote dónde te ve.</li>
            <li>Háblale encima mientras responde — se calla en el acto.</li>
          </ol>
        </section>

        {/* A stand-in for whatever screen the agent is meant to watch. Everything below is
            inert: it exists so the shared screen has something recognizable on it. */}
        <section className="fake-app" aria-label="Pantalla de ejemplo">
          <div className="fake-app-bar">
            <span className="fake-logo">Acme</span>
            <nav className="fake-nav">
              <span>Pedidos</span>
              <span>Productos</span>
              <span className="fake-nav-active">Pagos</span>
            </nav>
          </div>
          <div className="fake-app-body">
            <div className="fake-card">
              <h3>Conecta Acme Pay</h3>
              <p>Necesitas una cuenta de Acme Pay para poder cobrar en tu tienda.</p>
              <p className="fake-note">
                Ten a la mano el número de cuenta bancaria del negocio antes de empezar.
              </p>
              <button type="button" className="fake-button" disabled>
                Empezar
              </button>
              <p className="fake-disabled-note">
                (Botón inerte: esto es una maqueta para la demo.)
              </p>
            </div>
          </div>
        </section>

        <footer className="demo-footer">
          <p>
            El playbook de esta demo está en <code>src/playbooks/example-playbook.ts</code>.
            Cámbialo y el asistente cambia de trabajo sin tocar nada más.
          </p>
        </footer>
      </div>

      {!isSupported ? (
        <p className="demo-unsupported">
          Este navegador no permite compartir pantalla. Usa Chrome o Edge en una computadora.
        </p>
      ) : isOpen ? (
        <VoicePanel session={session} locale={EXAMPLE_PLAYBOOK.locale} onClose={handleClose} />
      ) : (
        <button type="button" onClick={handleOpen} className="demo-entry">
          Hablar con el asistente
        </button>
      )}
    </main>
  )
}
