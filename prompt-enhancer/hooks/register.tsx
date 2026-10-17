import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { buildPrompt, cleanOutput, formatHistory } from './build'
import { SYSTEM_PROMPT } from './system'

const MODEL = 'claude-haiku-5-5'

const status = atom({ plugin: 'prompt-enhancer', key: 'status' } as const, 'idle')
const previous = atom({ plugin: 'prompt-enhancer', key: 'previous' } as const, null)

async function enhance($: any, typed: string): Promise<string> {
  if ((await read($, status)) === 'working') return 'Amélioration déjà en cours.'
  const { text } = await $.prompt.read()
  const draft = text.trim()
  if (draft === '') return 'Écris ton prompt après la commande : /ameliorer ton prompt ici'

  await update($, status, () => 'working')
  try {
    const all = await $.session.messages()
    const history = Array.isArray(all) ? formatHistory(all) : ''
    const r = await $.model.complete({
      model: MODEL,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(history, draft),
      maxTokens: Math.max(1000, draft.length),
      effort: 'low',
      timeoutMs: 30000,
    })
    if (!r.isAnswered) {
      await update($, status, () => 'error')
      return `Amélioration impossible (${r.reason}).`
    }
    const improved = cleanOutput(r.text)
    if (improved === '') {
      await update($, status, () => 'error')
      return 'Réponse vide, prompt inchangé.'
    }
    await update($, previous, () => draft)
    await $.prompt.fill({ text: improved, mode: 'replace' })
    await update($, status, () => 'idle')
    return 'Prompt amélioré dans la barre de saisie. /annuler-prompt pour revenir à l’original.'
  } catch {
    await update($, status, () => 'error')
    return 'Erreur pendant l’amélioration du prompt.'
  }
}

async function undo($: any): Promise<string> {
  const original = await read($, previous)
  if (original === null) return 'Rien à annuler.'
  await $.prompt.fill({ text: original, mode: 'replace' })
  await update($, previous, () => null)
  return 'Prompt d’origine restauré.'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ameliorer',
      description: 'Améliore le prompt en cours de saisie avec Haiku 5.5',
    })
    await $.command.register({
      name: 'annuler-prompt',
      description: 'Restaure le prompt avant amélioration',
    })
    return next(e)
  })

  on('command.run', { command: 'ameliorer' }, async ($, e) => ({ text: await enhance($, e.args) }))
  on('command.run', { command: 'annuler-prompt' }, async $ => ({ text: await undo($) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const state = await read($, status)
    const saved = await read($, previous)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Button
          key="enhance"
          label={state === 'working' ? '✨ Amélioration…' : '✨ Améliorer le prompt'}
          onPress={async () => {
            const msg = await enhance($, '')
            if (msg.startsWith('Prompt amélioré') === false) $.ui.toast(msg)
          }}
        />
        {saved !== null && state !== 'working' ? (
          <Button key="undo" label=" ↩ Annuler" onPress={() => undo($)} />
        ) : null}
        {state === 'error' ? <Text dimColor> (échec, réessaie)</Text> : null}
      </Box>
    )
  })
}
