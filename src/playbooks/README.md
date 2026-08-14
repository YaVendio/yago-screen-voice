# Writing a playbook

A playbook is the agent's entire knowledge, as a typed structure instead of a prompt string.
`buildSystemInstruction()` renders it into the system instruction at session start.

Writing it as data rather than prose is the point: a support person can add a problem without
touching a prompt, the same knowledge renders per locale without being translated twice, and
you can diff two versions of what the agent knows.

Start by copying `example-playbook.ts`.

## The one rule that decides whether this works

**`signals` must be the exact text the user sees, copied from the real UI.**

That is what the agent matches a screen frame against. It is the difference between:

> "Veo que el banco rechazó la cuenta. Revisa el número en tu app del banco y escríbelo sin
> espacios."

and:

> "¿Qué dice el mensaje que te salió?"

Paraphrase the signal and you get the second one. Go through the flow yourself, screenshot
every failure state, and copy the strings character for character.

Keep the signals in whatever language the screen renders in. If the provider shows English UI
to a Spanish-speaking user, the signals stay English while the solution stays Spanish. Do not
"fix" that inconsistency — it reflects what is actually on screen.

## The fields

| Field | What goes in it |
|---|---|
| `role` | Who the agent is, in one or two sentences. Name the job, not a personality. |
| `scope.allowed` | Every screen it may discuss. Be specific — "Settings → Partners", not "the settings". |
| `scope.refusal` | What to say when asked about anything else. One sentence, then back to the step. |
| `entrySteps` | The screens every path shares before the user picks one. |
| `options` | The forks. Each needs a `whenToChoose` the agent can decide from a frame. |
| `finishSteps` | The screens every path shares once the hard part is done. |
| `recovery` | The full reset, for someone who did this before and now cannot. |
| `problems` | One entry per known failure. `signals` + `solution`. |
| `escalation` | When to stop trying. Every playbook needs a floor. |
| `conduct` | Rules specific to this flow (see below). |
| `opening` | What to do in the first two seconds. Rendered last in the prompt. |

## `conduct` vs. the shared rules

`buildSystemInstruction` already applies rules that hold for any screen-watching voice agent:
reply in the user's language, one step at a time, never ask for a verification code, ask
instead of inventing when the screen is unfamiliar. You do not repeat those.

`conduct` is for what is only true here. In practice it is two questions:

**What may the agent tell someone to delete?** Write a closed list, never a category. "The
partners named X and Y, and only if they have no other assets attached" is a rule. "Old
integrations" is a license to improvise on someone's account. If the answer is nothing, say
nothing — explicitly.

**How hard may it push on a failure?** If each failed attempt leaves debris, the rule is
clean-up-then-one-more-try. If the provider hosts the whole flow and leaves nothing behind,
the rule is one retry then a human. Getting this backwards is how an agent talks someone into
breaking their own account.

## Multiple locales, multiple flows

Playbooks are plain objects, so a real deployment usually holds a matrix:

```ts
const PLAYBOOKS = {
  providerA: { es: PROVIDER_A_ES, pt: PROVIDER_A_PT },
  providerB: { es: PROVIDER_B_ES, pt: PROVIDER_B_PT },
}

// Fall back on locale, never on flow: an approximate language is recoverable,
// a playbook for the wrong provider is not.
export function getPlaybook(locale: string, flow: Flow): Playbook {
  const byLocale = PLAYBOOKS[flow]
  return locale === 'pt' ? byLocale.pt : byLocale.es
}
```

Author each locale separately rather than translating. The model picks its register from the
prompt, and a translated prompt produces translated-sounding speech.

## Testing a playbook

Two things are worth asserting, and neither needs a model:

1. **Every problem's `signals` are non-empty and unique across the playbook.** A duplicated
   signal means two problems compete for the same screen.
2. **`buildSystemInstruction()` output contains the strings that must be there** — the closed
   delete list, the escalation floor, the refusal. Those are the rules that cause damage when
   they silently disappear in an edit.
