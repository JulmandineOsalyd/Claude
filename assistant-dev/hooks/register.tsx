import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Task } from '../types'
import {
  INSTRUCTION,
  advise,
  breathFrame,
  buildInstructions,
  describeCall,
  mergeTasks,
  parseBlock,
  progressLine,
  renderSummary,
} from './logic'

const PANE = 'assistant-dev'
const IMPROVE_SYSTEM =
  'Tu réécris le brouillon de prompt de l’utilisateur pour un assistant de développement. ' +
  'Garde son intention et sa langue, rends-le précis (objectif, contexte, contraintes, résultat attendu) sans rien inventer. ' +
  'Réponds uniquement par le prompt réécrit, sans commentaire ni guillemets.'
const tasks = atom({ plugin: 'assistant-dev', key: 'tasks' } as const, [])
const done = atom({ plugin: 'assistant-dev', key: 'done' } as const, [])
const advice = atom({ plugin: 'assistant-dev', key: 'advice' } as const, null)
const dismissal = atom({ plugin: 'assistant-dev', key: 'dismissal' } as const, null)
const showDetail = atom({ plugin: 'assistant-dev', key: 'showDetail' } as const, false)
const beat = atom({ plugin: 'assistant-dev', key: 'beat' } as const, -1)
const tab = atom({ plugin: 'assistant-dev', key: 'tab' } as const, 'courant')

const isKept = (t: Task) => t.status === 'gardee' || t.status === 'en_cours'

async function save($: EngineInterface) {
  const list = await read($, tasks)
  await $.store.set('kept', list.filter(isKept))
}

// Ajoute au brouillon sans écraser ce qui s'y trouve (autres tâches lancées, texte tapé).
async function addToPrompt($: EngineInterface, text: string) {
  const { text: draft } = await $.prompt.read()
  if (draft.trim() === '') return $.prompt.fill({ text, mode: 'replace' })

  return $.prompt.fill({ text: `\n${text}`, mode: 'append' })
}

async function change($: EngineInterface, fn: (list: Task[]) => Task[]) {
  await update($, tasks, fn)
  await save($)
}

export const register: Register = on => {
  let timer: { cancel: () => void } | null = null
  let lastPercent: number | null = null
  let lastAdviceTurn = -100

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'assistant-dev',
      description: 'Ouvre le panneau Tâches ; « detail » affiche ou masque le détail des actions',
    })
    const stored = (await $.store.get('kept')) as Task[] | undefined
    const current = await read($, tasks)
    if (current.length === 0 && Array.isArray(stored) && stored.length > 0) {
      await update($, tasks, () => stored)
    }
    void $.ui.open({ id: PANE, title: 'Tâches' })

    return next(e)
  })

  on('command.run', { command: 'assistant-dev' }, async ($, e) => {
    if (e.args.trim() === 'detail') {
      await update($, showDetail, v => !v)
      $.ui.invalidate('ui.render')

      return { text: 'Détail des actions basculé.' }
    }
    await $.ui.open({ id: PANE, title: 'Tâches' })

    return { text: 'Panneau Tâches ouvert.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)

    return {
      sections: [...out.sections, { id: 'assistant-dev:format', text: INSTRUCTION, scope: 'session' as const }],
    }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, tasks, list => list.map(t => (t.status === 'en_cours' ? { ...t, isSent: true } : t)))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      timer?.cancel()
      await update($, beat, () => 0)
      timer = $.clock.every(1000, () => {
        void update($, beat, n => n + 1)
      })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    timer?.cancel()
    timer = null
    await update($, beat, () => -1)

    const block = parseBlock(e.answer)
    const turn = await $.session.turns()
    await update($, tasks, list =>
      list.map(t => (t.status === 'en_cours' && t.isSent ? { ...t, status: 'faite' as const } : t)),
    )
    if (block) {
      await update($, tasks, list => mergeTasks(list, block, turn))
      await update($, done, list => [...list, ...block.realise].slice(-60))
      await save($)
    }

    const usage = await $.session.usage()
    const list = await read($, tasks)
    const percent = usage.context.percent ?? 0
    const growth = lastPercent === null ? 0 : percent - lastPercent
    lastPercent = percent
    const next$ = advise({
      percent,
      growth,
      reason: e.reason,
      doneCount: block?.realise.length ?? 0,
      isNewTopic: block?.nouveauSujet === true,
      isBlocked: block?.bloque === true,
      turn,
      sinceLast: turn - lastAdviceTurn,
      dismissal: await read($, dismissal),
    })
    if (next$ !== null) lastAdviceTurn = turn
    await update($, advice, () => next$)

    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = renderSummary(e.props.text)
    if (text === e.props.text) return next(e)

    return next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.isErrored || (await read($, showDetail))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    if (!e.props.isRunning) return <Box display="none" />

    return (
      <Box paddingX={1}>
        <Text color="cyan">⏳ {describeCall(e.props.tool)}…</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.isErrored || (await read($, showDetail))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (await read($, showDetail)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const line = progressLine(e.props.calls)
    if (line === null) return <Box display="none" />

    return (
      <Box paddingX={1}>
        <Text color="cyan">⏳ {line}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const tip = await read($, advice)
    const pulse = await read($, beat)
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    const improve = async () => {
      const { text: draft } = await $.prompt.read()
      if (draft.trim() === '') {
        $.ui.toast('Écris d’abord ton prompt, puis clique sur Améliorer.')

        return
      }
      $.ui.toast('Amélioration du prompt…')
      const r = await $.model.complete({ model: 'haiku', system: IMPROVE_SYSTEM, prompt: draft, maxTokens: 1500 })
      if (!r.isAnswered) {
        $.ui.toast('Amélioration impossible : réessaie dans un instant.')

        return
      }
      await $.prompt.fill({ text: r.text.trim(), mode: 'replace' })
      $.ui.toast('Prompt amélioré : relis puis envoie.')
    }
    const improveButton = <Button key="improve" label="✨ Améliorer le prompt" onPress={improve} />

    // Pendant le travail : une ligne de respiration. Dès que le tour se termine, elle
    // disparaît et la proposition de compactage reprend la bande.
    if (pulse >= 0) {
      const f = breathFrame(pulse)

      return (
        <Box gap={1} paddingX={1}>
          <Text color="cyan">◯ {f.bar}</Text>
          <Text bold color="cyan">
            {f.label}
          </Text>
          <Text dimColor>
            {f.cycles} cycle{f.cycles > 1 ? 's' : ''} · {f.elapsed}
          </Text>
          {improveButton}
        </Box>
      )
    }
    if (e.props.isWorking || tip === null) {
      return (
        <Box paddingX={1}>
          {improveButton}
        </Box>
      )
    }

    const compact = async () => {
      const [list, finished] = await Promise.all([read($, tasks), read($, done)])
      await update($, advice, () => null)
      // Ici la session est pilotée par l'application (mode SDK) : $.session.compact n'y existe
      // pas encore, le compactage passe par une commande /compact envoyée comme un prompt.
      const text = `/compact ${buildInstructions(list, finished).replace(/\s*\n\s*/g, ' | ')}`
      try {
        await $.prompt.submit({ text })
      } catch {
        await addToPrompt($, text)
        $.ui.toast('Commande /compact insérée dans le prompt : appuie sur Entrée pour compacter.')
      }
    }
    const later = async () => {
      const turn = await $.session.turns()
      await update($, dismissal, () => ({ turn, percent: tip.percent }))
      await update($, advice, () => null)
    }

    const tone = tip.isUrgent ? 'red' : 'yellow'

    return (
      <Box gap={1} paddingX={1} borderStyle="round" borderColor={tone}>
        <Text bold color={tone}>
          {tip.isUrgent ? '⚠' : '◆'}
        </Text>
        <Text>{tip.reason} Compacter ?</Text>
        <Button key="compact" label="Compacter" variant="primary" onPress={compact} />
        <Button key="later" label="Plus tard" onPress={later} />
        {improveButton}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text>Panneau Tâches indisponible sur mobile.</Text>
    }
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const list = await read($, tasks)
    const current = await read($, tab)

    const launch = async (t: Task, text: string) => {
      await addToPrompt($, text)
      await change($, l =>
        l.map(x => ({ ...x, isNext: false, status: x.id === t.id ? ('en_cours' as const) : x.status, isSent: false })),
      )
      $.ui.toast('Tâche ajoutée au prompt : relis puis envoie.')
    }
    const setStatus = (t: Task, status: Task['status']) =>
      change($, l => l.map(x => (x.id === t.id ? { ...x, status, isNext: false } : x)))

    const KIND = {
      question: { icon: '?', color: 'yellow', label: 'Question' },
      correction: { icon: '!', color: 'red', label: 'Correction' },
      suggestion: { icon: '+', color: 'cyan', label: 'Suggestion' },
    } as const

    const card = (t: Task, isGardee: boolean, isNext = false) => {
      const k = KIND[t.kind]
      const accent = isNext ? 'green' : k.color

      return (
        <Box
          key={`card-${t.id}`}
          flexDirection="column"
          gap={1}
          paddingX={1}
          borderStyle="round"
          borderColor={accent}
        >
          <Box gap={1}>
            <Text bold color={accent}>
              {k.icon}
            </Text>
            <Text bold>{t.title}</Text>
          </Box>
          <Box gap={1}>
            <Text color={k.color} dimColor>
              {k.label}
            </Text>
            {t.severity === 'haute' ? <Text color="red">● haute</Text> : null}
            {t.status === 'en_cours' ? <Text color="green">▶ en cours</Text> : null}
          </Box>
          {t.detail ? <Text dimColor>{t.detail}</Text> : null}
          {t.kind === 'question' && t.options ? (
            <Box flexWrap="wrap" gap={1}>
              {t.options.map((o, i) => (
                <Button
                  key={`opt-${t.id}-${i}`}
                  label={o}
                  onPress={async () => {
                    await addToPrompt($, `Réponse à « ${t.title} » : ${o}`)
                    await setStatus(t, 'faite')
                  }}
                />
              ))}
            </Box>
          ) : null}
          {t.kind === 'question' ? (
            <Input
              key={`in-${t.id}`}
              placeholder="Ta réponse…"
              submitLabel="insérer"
              onSubmit={async v => {
                if (!v.trim()) return
                await addToPrompt($, `Réponse à « ${t.title} » : ${v.trim()}`)
                await setStatus(t, 'faite')
              }}
            />
          ) : (
            <Box gap={1}>
              <Button
                key={`go-${t.id}`}
                label="▶ Lancer"
                variant="primary"
                onPress={() => launch(t, `Réalise cette tâche : ${t.title}.${t.detail ? ` ${t.detail}` : ''}`)}
              />
              {isGardee ? null : (
                <Button key={`keep-${t.id}`} label="★ Garder" onPress={() => setStatus(t, 'gardee')} />
              )}
              <Button
                key={`no-${t.id}`}
                label={isGardee ? 'Retirer' : 'Écarter'}
                onPress={() => setStatus(t, 'ecartee')}
              />
            </Box>
          )}
        </Box>
      )
    }

    const section = (title: string, color: string, items: Task[], isGardee = false, isNext = false) =>
      items.length === 0 ? null : (
        <Box key={`sec-${title}`} flexDirection="column" gap={1}>
          <Text bold color={color}>
            {title.toUpperCase()} · {items.length}
          </Text>
          {items.map(t => card(t, isGardee, isNext))}
        </Box>
      )

    const open = list.filter(t => t.status === 'proposee')
    const kept = list.filter(t => t.status === 'gardee' || t.status === 'en_cours')
    const nextTask = open.find(t => t.isNext) ?? kept.find(t => t.isNext)
    const rest = (kind: Task['kind']) => open.filter(t => t.kind === kind && t !== nextTask)
    const isEmpty = open.length === 0 && !nextTask

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box gap={1}>
          <Button
            key="t1"
            label={`Courant · ${open.length}`}
            variant={current === 'courant' ? 'primary' : undefined}
            onPress={() => update($, tab, () => 'courant')}
          />
          <Button
            key="t2"
            label={`★ Gardées · ${kept.length}`}
            variant={current === 'gardees' ? 'primary' : undefined}
            onPress={() => update($, tab, () => 'gardees')}
          />
        </Box>
        {current === 'courant' ? (
          <Box flexDirection="column" gap={1}>
            {isEmpty ? <Text dimColor>✓ Rien en attente. Les prochaines propositions arriveront ici.</Text> : null}
            {nextTask ? section('Prochaine étape', 'green', [nextTask], nextTask.status !== 'proposee', true) : null}
            {section('Questions pour toi', 'yellow', rest('question'))}
            {section('Corrections proposées', 'red', rest('correction'))}
            {section('Suggestions', 'cyan', rest('suggestion'))}
          </Box>
        ) : (
          <Box flexDirection="column" gap={1}>
            {kept.length === 0 ? <Text dimColor>★ Aucune tâche gardée. Appuie sur « Garder » pour en conserver.</Text> : null}
            {section('Gardées', 'magenta', kept, true)}
          </Box>
        )}
      </Box>
    )
  })
}
