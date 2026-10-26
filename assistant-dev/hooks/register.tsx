import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Task } from '../types'
import {
  INSTRUCTION,
  breathFrame,
  describeCall,
  mergeTasks,
  parseBlock,
  progressLine,
  renderSummary,
} from './logic'

const PANE = 'assistant-dev'
const tasks = atom({ plugin: 'assistant-dev', key: 'tasks' } as const, [])
const done = atom({ plugin: 'assistant-dev', key: 'done' } as const, [])
const showDetail = atom({ plugin: 'assistant-dev', key: 'showDetail' } as const, false)
const expanded = atom({ plugin: 'assistant-dev', key: 'expanded' } as const, [])
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
    const pulse = await read($, beat)
    if (e.props.hasSurvey || pulse < 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const f = breathFrame(pulse)

    // Une ligne de respiration pendant le travail ; elle disparaît dès que le tour se termine.
    return (
      <Box gap={1} paddingX={1}>
        <Text color="cyan">◯ {f.bar}</Text>
        <Text bold color="cyan">
          {f.label}
        </Text>
        <Text dimColor>
          {f.cycles} cycle{f.cycles > 1 ? 's' : ''} · {f.elapsed}
        </Text>
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
    const opened = await read($, expanded)

    const launch = async (t: Task, text: string) => {
      await addToPrompt($, text)
      await change($, l =>
        l.map(x => ({ ...x, isNext: false, status: x.id === t.id ? ('en_cours' as const) : x.status, isSent: false })),
      )
      $.ui.toast('Tâche ajoutée au prompt : relis puis envoie.')
    }
    const launchText = (t: Task) => `Réalise cette tâche : ${t.title}.${t.detail ? ` ${t.detail}` : ''}`
    const setStatus = (t: Task, status: Task['status']) =>
      change($, l => l.map(x => (x.id === t.id ? { ...x, status, isNext: false } : x)))
    const toggle = (id: string) =>
      update($, expanded, l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))
    // Une tâche ajoutée à la main est gardée d'office : sinon la prochaine réponse la remplacerait.
    const addManual = async (title: string) => {
      const turn = await $.session.turns()
      await change($, l => [
        ...l,
        { id: `manual-${Date.now()}`, kind: 'suggestion' as const, title, status: 'gardee' as const, turn },
      ])
      await update($, tab, () => 'gardees')
      $.ui.toast('Tâche ajoutée dans « Gardées ».')
    }
    const answer = async (t: Task, value: string) => {
      await addToPrompt($, `Réponse à « ${t.title} » : ${value}`)
      await setStatus(t, 'faite')
    }

    const KIND = {
      question: { color: 'yellow', label: 'question' },
      correction: { color: 'red', label: 'correction' },
      suggestion: { color: 'cyan', label: 'suggestion' },
    } as const

    const RANK = { haute: 0, moyenne: 1, basse: 2 } as const
    const bySeverity = (a: Task, b: Task) => (RANK[a.severity ?? 'basse'] ?? 2) - (RANK[b.severity ?? 'basse'] ?? 2)

    const actions = (t: Task, isGardee: boolean, isPrimary: boolean) => (
      <Box gap={1}>
        <Button
          key={`go-${t.id}`}
          label="Lancer"
          variant={isPrimary ? 'primary' : undefined}
          onPress={() => launch(t, launchText(t))}
        />
        {isGardee ? null : <Button key={`keep-${t.id}`} label="Garder" onPress={() => setStatus(t, 'gardee')} />}
        <Button key={`no-${t.id}`} label={isGardee ? 'Retirer' : 'Écarter'} onPress={() => setStatus(t, 'ecartee')} />
      </Box>
    )

    const answers = (t: Task) => (
      <Box flexDirection="column">
        {t.options ? (
          <Box flexWrap="wrap" gap={1}>
            {t.options.map((o, i) => (
              <Button key={`opt-${t.id}-${i}`} label={o} onPress={() => answer(t, o)} />
            ))}
          </Box>
        ) : null}
        <Input
          key={`in-${t.id}`}
          placeholder="Ta réponse…"
          submitLabel="insérer"
          onSubmit={async v => {
            if (v.trim()) await answer(t, v.trim())
          }}
        />
      </Box>
    )

    // Mise en avant de la tâche à faire en premier : titre, détail et actions toujours visibles.
    const hero = (t: Task, isGardee: boolean) => {
      const k = KIND[t.kind]

      return (
        <Box key={`hero-${t.id}`} flexDirection="column" paddingX={1} borderStyle="round" borderColor="green">
          <Box gap={1}>
            <Text color={k.color}>●</Text>
            <Text bold>{t.title}</Text>
            {t.severity === 'haute' ? <Text color="red">haute</Text> : null}
            {t.status === 'en_cours' ? <Text color="green">▶ en cours</Text> : null}
          </Box>
          {t.detail ? <Text dimColor>{t.detail}</Text> : null}
          {t.kind === 'question' ? answers(t) : actions(t, isGardee, true)}
        </Box>
      )
    }

    // Ligne dense : le titre reste du texte simple, seul le chevron est cliquable et déplie le détail.
    const row = (t: Task, isGardee: boolean) => {
      const k = KIND[t.kind]
      const isOpen = opened.includes(t.id)

      return (
        <Box key={`row-${t.id}`} flexDirection="column">
          <Box gap={1}>
            <Button key={`t-${t.id}`} label={isOpen ? '▾' : '▸'} onPress={() => toggle(t.id)} />
            <Text color={k.color}>●</Text>
            <Text bold={isOpen}>{t.title}</Text>
            {t.severity === 'haute' ? <Text color="red">haute</Text> : null}
            {t.status === 'en_cours' ? <Text color="green">en cours</Text> : null}
          </Box>
          {isOpen ? (
            <Box flexDirection="column" paddingX={4}>
              <Text color={k.color}>{k.label}</Text>
              {t.detail ? <Text dimColor>{t.detail}</Text> : null}
              {t.kind === 'question' ? answers(t) : actions(t, isGardee, false)}
            </Box>
          ) : null}
        </Box>
      )
    }

    const SECTION = { Questions: 'yellow', Corrections: 'red', Suggestions: 'cyan', Gardées: 'magenta' } as const
    const section = (title: keyof typeof SECTION, items: Task[], isGardee = false) =>
      items.length === 0 ? null : (
        <Box key={`sec-${title}`} flexDirection="column">
          <Text bold color={SECTION[title]}>
            {title.toUpperCase()} · {items.length}
          </Text>
          {[...items].sort(bySeverity).map(t => row(t, isGardee))}
        </Box>
      )

    const open = list.filter(t => t.status === 'proposee')
    const kept = list.filter(t => t.status === 'gardee' || t.status === 'en_cours')
    const nextTask = open.find(t => t.isNext) ?? kept.find(t => t.isNext)
    const rest = (kind: Task['kind']) => open.filter(t => t.kind === kind && t !== nextTask)
    const isEmpty = open.length === 0 && !nextTask

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Text dimColor>
          {open.length} à traiter · {kept.length} gardée{kept.length > 1 ? 's' : ''}
        </Text>
        <Box gap={1}>
          <Button
            key="t1"
            label="Courant"
            variant={current === 'courant' ? 'primary' : undefined}
            onPress={() => update($, tab, () => 'courant')}
          />
          <Button
            key="t2"
            label="Gardées"
            variant={current === 'gardees' ? 'primary' : undefined}
            onPress={() => update($, tab, () => 'gardees')}
          />
        </Box>
        <Input
          key="add-task"
          placeholder="Ajouter une tâche…"
          submitLabel="ajouter"
          onSubmit={async v => {
            if (v.trim()) await addManual(v.trim())
          }}
        />
        {current === 'courant' ? (
          <Box flexDirection="column" gap={1}>
            {isEmpty ? <Text dimColor>✓ Rien en attente. Les prochaines propositions arriveront ici.</Text> : null}
            {nextTask ? (
              <Box flexDirection="column">
                <Text bold color="green">
                  À FAIRE EN PREMIER
                </Text>
                {hero(nextTask, nextTask.status !== 'proposee')}
              </Box>
            ) : null}
            {section('Questions', rest('question'))}
            {section('Corrections', rest('correction'))}
            {section('Suggestions', rest('suggestion'))}
          </Box>
        ) : (
          <Box flexDirection="column" gap={1}>
            {kept.length === 0 ? (
              <Text dimColor>Aucune tâche gardée. Appuie sur « Garder » pour en conserver.</Text>
            ) : null}
            {section('Gardées', kept, true)}
          </Box>
        )}
      </Box>
    )
  })
}
