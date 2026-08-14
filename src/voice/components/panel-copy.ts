import type { PlaybookLocale, VoiceSessionErrorCode } from '../types'

export interface PanelCopy {
  title: string
  subtitle: string
  close: string
  live: string
  muted: string
  consentBody: string
  consentScreen: string
  consentMic: string
  ctaStart: string
  micReady: string
  shareScreenBody: string
  ctaShareScreen: string
  connecting: string
  transcriptEmpty: string
  speakerAgent: string
  speakerUser: string
  ended: string
  ctaRetry: string
  ctaRestart: string
  ctaMute: string
  ctaUnmute: string
  ctaPauseScreen: string
  ctaResumeScreen: string
  ctaEnd: string
  muteHint: string
  screenPausedHint: string
  humanHelpFallback: string
  errors: Record<VoiceSessionErrorCode, string>
}

/**
 * Every error message names what to do next, never just what failed. "Something went wrong"
 * sends someone to support with nothing to act on; "your browser blocked the microphone"
 * tells them which of the two permissions to look at.
 */
export const PANEL_COPY: Record<PlaybookLocale, PanelCopy> = {
  es: {
    title: 'Asistente de voz',
    subtitle: 'Te acompaña paso a paso, viendo tu pantalla.',
    close: 'Cerrar',
    live: 'En vivo',
    muted: 'Micrófono silenciado',
    consentBody: 'Para acompañarte necesita dos permisos:',
    consentScreen: 'Ver tu pantalla mientras dure la sesión',
    consentMic: 'Escucharte por el micrófono',
    ctaStart: 'Empezar',
    micReady: 'Micrófono listo',
    shareScreenBody:
      'Ahora comparte tu pantalla completa. Tiene que ser la pantalla entera, no una pestaña ni una ventana.',
    ctaShareScreen: 'Compartir pantalla',
    connecting: 'Conectando…',
    transcriptEmpty: 'Ya te escucha. Cuéntale qué estás viendo.',
    speakerAgent: 'Asistente',
    speakerUser: 'Tú',
    ended: 'La sesión terminó.',
    ctaRetry: 'Reintentar',
    ctaRestart: 'Empezar de nuevo',
    ctaMute: 'Silenciar',
    ctaUnmute: 'Activar micrófono',
    ctaPauseScreen: 'Pausar pantalla',
    ctaResumeScreen: 'Reanudar pantalla',
    ctaEnd: 'Terminar sesión',
    muteHint: 'Silencia el micrófono si vas a leer un código en voz alta.',
    screenPausedHint: 'La pantalla está pausada: no se están enviando capturas.',
    humanHelpFallback: 'Falló varias veces. Mejor escribe a soporte para que te ayude una persona.',
    errors: {
      'mic-denied': 'El navegador bloqueó el micrófono. Permítelo y vuelve a intentar.',
      'mic-unavailable': 'No se pudo usar el micrófono. Revisa que no lo tenga otra aplicación.',
      'screen-denied': 'No se compartió la pantalla. Sin ella el asistente no puede guiarte.',
      'screen-unavailable': 'No se pudo capturar la pantalla en este navegador.',
      'partial-screen-share':
        'Compartiste una pestaña o una ventana. Tiene que ser la pantalla completa, porque los pasos ocurren fuera de esta pestaña.',
      'token-request-failed': 'No se pudo iniciar la sesión. Intenta de nuevo en un momento.',
      'connection-failed': 'No se pudo conectar con el asistente. Intenta de nuevo.',
      'connection-lost': 'Se perdió la conexión con el asistente.',
      'unsupported-browser':
        'Este navegador no permite compartir pantalla. Usa Chrome o Edge en una computadora.',
    },
  },
  en: {
    title: 'Voice assistant',
    subtitle: 'Walks you through it step by step, watching your screen.',
    close: 'Close',
    live: 'Live',
    muted: 'Microphone muted',
    consentBody: 'It needs two permissions to help you:',
    consentScreen: 'See your screen for as long as the session lasts',
    consentMic: 'Hear you through the microphone',
    ctaStart: 'Start',
    micReady: 'Microphone ready',
    shareScreenBody:
      'Now share your entire screen. It has to be the whole screen, not a tab or a window.',
    ctaShareScreen: 'Share screen',
    connecting: 'Connecting…',
    transcriptEmpty: 'It can hear you. Tell it what you are looking at.',
    speakerAgent: 'Assistant',
    speakerUser: 'You',
    ended: 'The session ended.',
    ctaRetry: 'Try again',
    ctaRestart: 'Start over',
    ctaMute: 'Mute',
    ctaUnmute: 'Unmute',
    ctaPauseScreen: 'Pause screen',
    ctaResumeScreen: 'Resume screen',
    ctaEnd: 'End session',
    muteHint: 'Mute the microphone if you are about to read a code out loud.',
    screenPausedHint: 'The screen is paused: no frames are being sent.',
    humanHelpFallback: 'This failed several times. Contact support so a person can help you.',
    errors: {
      'mic-denied': 'The browser blocked the microphone. Allow it and try again.',
      'mic-unavailable': 'The microphone could not be used. Check no other app is holding it.',
      'screen-denied': 'The screen was not shared. Without it the assistant cannot guide you.',
      'screen-unavailable': 'The screen could not be captured in this browser.',
      'partial-screen-share':
        'You shared a tab or a window. It has to be the entire screen, because the steps happen outside this tab.',
      'token-request-failed': 'The session could not start. Try again in a moment.',
      'connection-failed': 'Could not connect to the assistant. Try again.',
      'connection-lost': 'The connection to the assistant was lost.',
      'unsupported-browser':
        'This browser cannot share the screen. Use Chrome or Edge on a computer.',
    },
  },
  pt: {
    title: 'Assistente de voz',
    subtitle: 'Acompanha você passo a passo, vendo a sua tela.',
    close: 'Fechar',
    live: 'Ao vivo',
    muted: 'Microfone silenciado',
    consentBody: 'Ele precisa de duas permissões para ajudar:',
    consentScreen: 'Ver a sua tela enquanto durar a sessão',
    consentMic: 'Ouvir você pelo microfone',
    ctaStart: 'Começar',
    micReady: 'Microfone pronto',
    shareScreenBody:
      'Agora compartilhe a tela inteira. Precisa ser a tela toda, não uma aba nem uma janela.',
    ctaShareScreen: 'Compartilhar tela',
    connecting: 'Conectando…',
    transcriptEmpty: 'Ele já ouve você. Conte o que está vendo.',
    speakerAgent: 'Assistente',
    speakerUser: 'Você',
    ended: 'A sessão terminou.',
    ctaRetry: 'Tentar de novo',
    ctaRestart: 'Começar de novo',
    ctaMute: 'Silenciar',
    ctaUnmute: 'Ativar microfone',
    ctaPauseScreen: 'Pausar tela',
    ctaResumeScreen: 'Retomar tela',
    ctaEnd: 'Encerrar sessão',
    muteHint: 'Silencie o microfone se for ler um código em voz alta.',
    screenPausedHint: 'A tela está pausada: nenhuma captura está sendo enviada.',
    humanHelpFallback: 'Falhou várias vezes. Fale com o suporte para uma pessoa ajudar.',
    errors: {
      'mic-denied': 'O navegador bloqueou o microfone. Permita e tente de novo.',
      'mic-unavailable': 'Não foi possível usar o microfone. Veja se outro app está usando.',
      'screen-denied': 'A tela não foi compartilhada. Sem ela o assistente não consegue guiar.',
      'screen-unavailable': 'Não foi possível capturar a tela neste navegador.',
      'partial-screen-share':
        'Você compartilhou uma aba ou uma janela. Precisa ser a tela inteira, porque os passos acontecem fora desta aba.',
      'token-request-failed': 'A sessão não pôde iniciar. Tente de novo em instantes.',
      'connection-failed': 'Não foi possível conectar ao assistente. Tente de novo.',
      'connection-lost': 'A conexão com o assistente caiu.',
      'unsupported-browser':
        'Este navegador não compartilha tela. Use Chrome ou Edge em um computador.',
    },
  },
}
