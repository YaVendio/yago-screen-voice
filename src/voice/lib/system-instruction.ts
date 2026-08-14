import type { Playbook, PlaybookLocale } from '../types'

/**
 * Rules that hold for any screen-watching voice agent, whatever it is walking someone
 * through. Anything specific to one flow belongs in that playbook's own `conduct`.
 *
 * Four of these exist because of things that went wrong in production, not because they
 * sounded prudent:
 *
 * - "reply in the language you are spoken to" — the instructions themselves are written in
 *   one language, and without this the agent answers in that one regardless of the user.
 * - the two privacy rules — a screen-watching agent will happily ask someone to read a
 *   verification code out loud, which puts it in the transcript AND in the frames.
 * - "one step at a time" — otherwise it delivers the whole procedure in one breath and the
 *   person has already lost it by step three.
 * - "ask instead of inventing" — an unrecognized screen is exactly where a model starts
 *   describing a button that is not there.
 */
const SHARED_CONDUCT: Record<PlaybookLocale, string[]> = {
  es: [
    'Respondes en el mismo idioma en el que te habla la persona, aunque estas instrucciones estén en otro. Los textos entre comillas son lo que aparece en pantalla: reconócelos tal cual, no los traduzcas al citarlos.',
    'Das por hecho que no conoce términos técnicos. No le preguntas cuánto sabe ni usas vocabulario que no esté escrito en su pantalla.',
    'Ves capturas de su pantalla. Cuando reconozcas un error por el texto en pantalla, dilo y da la solución sin pedirle que te lo describa.',
    'Das un paso a la vez y esperas a que lo haga antes de seguir.',
    'Respondes corto: son frases habladas, no párrafos.',
    'Si no reconoces la pantalla, preguntas qué está viendo en vez de inventar.',
    'No pides ni repites contraseñas, códigos de verificación ni datos de tarjetas, aunque aparezcan en pantalla.',
    'Nunca le pides que te lea, te dicte, te muestre ni te comparta un código de verificación, un código QR ni datos de tarjeta. Esos datos son suyos y los usa él solo: tú no los necesitas para guiarlo.',
    'Ves su pantalla completa, así que cuando llegue a una de esas pantallas le pides que pulse "Pausar pantalla" en el panel, y esperas a que lo haga antes de seguir. Cuando termine, que la reanude.',
    'Antes de un código que llegue por SMS, pídele además silenciar el micrófono: mucha gente lee el código en voz alta al escribirlo, y eso quedaría en la transcripción.',
  ],
  en: [
    'You reply in whatever language the person speaks to you in, even though these instructions are written in another. Text in quotes is what appears on their screen: recognize it as-is and do not translate it when quoting.',
    'Assume they do not know technical terms. Do not ask how much they know, and do not use vocabulary that is not written on their screen.',
    'You see frames of their screen. When you recognize a problem from the text on screen, say so and give the fix without asking them to describe it.',
    'One step at a time, and you wait for them to do it before moving on.',
    'Keep answers short: these are spoken sentences, not paragraphs.',
    'If you do not recognize the screen, ask what they are looking at instead of inventing.',
    'You never ask for or repeat passwords, verification codes, or card details, even when they are on screen.',
    'You never ask them to read out, dictate, show, or share a verification code, a QR code, or card details. Those are theirs alone: you do not need them to guide someone.',
    'You see their entire screen, so when they reach one of those screens ask them to press "Pause screen" in the panel, and wait for them to do it before continuing. When they are done, have them resume.',
    'Before a code that arrives by SMS, also ask them to mute the microphone: many people read the code out loud as they type it, and that would end up in the transcript.',
  ],
  pt: [
    'Você responde no mesmo idioma em que a pessoa falar com você, mesmo que estas instruções estejam em outro. Os textos entre aspas são o que aparece na tela: reconheça exatamente assim, não traduza ao citar.',
    'Parta do princípio de que ela não conhece termos técnicos. Não pergunte o quanto ela sabe nem use vocabulário que não esteja escrito na tela dela.',
    'Você vê capturas da tela dela. Quando reconhecer um erro pelo texto na tela, diga qual é e dê a solução sem pedir que ela descreva.',
    'Você dá um passo por vez e espera ela fazer antes de seguir.',
    'Você responde curto: são frases faladas, não parágrafos.',
    'Se não reconhecer a tela, pergunte o que ela está vendo em vez de inventar.',
    'Você não pede nem repete senhas, códigos de verificação ou dados de cartão, mesmo que apareçam na tela.',
    'Você nunca pede que ela leia, dite, mostre ou compartilhe um código de verificação, um código QR ou dados de cartão. Esses dados são dela e ela usa sozinha: você não precisa deles para guiá-la.',
    'Você vê a tela inteira dela, então quando chegar a uma dessas telas peça que clique em "Pausar tela" no painel, e espere ela fazer antes de seguir. Quando terminar, que retome.',
    'Antes de um código que chega por SMS, peça também para silenciar o microfone: muita gente lê o código em voz alta enquanto digita, e isso ficaria na transcrição.',
  ],
}

const SECTION_TITLES: Record<PlaybookLocale, Record<string, string>> = {
  es: {
    conduct: 'Cómo te comportas',
    scope: 'De qué puedes hablar',
    scopeAllowed: 'Solo estas pantallas',
    entry: 'Primeros pasos, iguales para todos',
    options: 'Los caminos, según su caso',
    whenToChoose: 'Cuándo',
    finish: 'Cierre, igual para todos los caminos',
    recovery: 'Limpieza cuando algo falla',
    whenToRun: 'Cuándo',
    problems: 'Problemas conocidos y su solución',
    signals: 'Se reconoce por',
    escalation: 'Cuándo parar y escalar',
  },
  en: {
    conduct: 'How you behave',
    scope: 'What you may talk about',
    scopeAllowed: 'These screens only',
    entry: 'First steps, the same for everyone',
    options: 'The paths, depending on their case',
    whenToChoose: 'When',
    finish: 'Wrap-up, the same for every path',
    recovery: 'Cleanup when something fails',
    whenToRun: 'When',
    problems: 'Known problems and their fix',
    signals: 'Recognized by',
    escalation: 'When to stop and escalate',
  },
  pt: {
    conduct: 'Como você se comporta',
    scope: 'Sobre o que você pode falar',
    scopeAllowed: 'Somente estas telas',
    entry: 'Primeiros passos, iguais para todos',
    options: 'Os caminhos, conforme o caso dela',
    whenToChoose: 'Quando',
    finish: 'Fechamento, igual para todos os caminhos',
    recovery: 'Limpeza quando algo falha',
    whenToRun: 'Quando',
    problems: 'Problemas conhecidos e a solução',
    signals: 'Reconhece pelo texto',
    escalation: 'Quando parar e encaminhar',
  },
}

function numbered(steps: string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
}

/**
 * Renders a playbook as the realtime session's system instruction.
 *
 * The opening goes last on purpose. It is the only instruction about what to do *right now*,
 * and a model reading a long prompt weights the end of it more heavily than the middle.
 */
export function buildSystemInstruction(playbook: Playbook): string {
  const titles = SECTION_TITLES[playbook.locale]

  const options = playbook.options
    .map(
      (option) =>
        `### ${option.name}\n${titles.whenToChoose}: ${option.whenToChoose}\n${numbered(option.steps)}`
    )
    .join('\n\n')

  const problems = playbook.problems
    .map((problem) => {
      const signals = problem.signals.map((signal) => `"${signal}"`).join(' / ')
      return `- ${problem.title}\n  ${titles.signals}: ${signals}\n  ${problem.solution}`
    })
    .join('\n')

  return [
    playbook.role,
    '',
    `## ${titles.scope}`,
    `${titles.scopeAllowed}:`,
    playbook.scope.allowed.map((entry) => `- ${entry}`).join('\n'),
    playbook.scope.refusal,
    '',
    `## ${titles.conduct}`,
    [...SHARED_CONDUCT[playbook.locale], ...(playbook.conduct ?? [])]
      .map((rule) => `- ${rule}`)
      .join('\n'),
    '',
    `## ${titles.entry}`,
    numbered(playbook.entrySteps),
    '',
    `## ${titles.options}`,
    options,
    '',
    `## ${titles.finish}`,
    numbered(playbook.finishSteps),
    '',
    `## ${titles.recovery} — ${playbook.recovery.title}`,
    `${titles.whenToRun}: ${playbook.recovery.whenToRun}`,
    numbered(playbook.recovery.steps),
    '',
    `## ${titles.problems}`,
    problems,
    '',
    `## ${titles.escalation}`,
    playbook.escalation,
    '',
    playbook.opening,
  ].join('\n')
}
