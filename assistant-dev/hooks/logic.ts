import type { Done, Severity, Task } from '../types'

export type Block = {
  realise: Done[]
  suggestions: { titre: string; detail?: string }[]
  corrections: { titre: string; detail?: string; gravite?: Severity }[]
  questions: { titre: string; detail?: string; options?: string[] }[]
  prochaine?: string
}

const CLOSED = /```workbench\s*([\s\S]*?)```/
const OPEN = /```workbench[\s\S]*$/

export const INSTRUCTION = [
  'Mode Assistant dev actif. Réponds en français.',
  'Quand ta réponse a réalisé ou proposé quelque chose, termine-la par un bloc ```workbench contenant ce JSON, et rien d’autre après :',
  '{"realise":[{"titre":"…","detail":"description fonctionnelle, sans fichier ni commande"}],',
  '"suggestions":[{"titre":"…","detail":"…"}],',
  '"corrections":[{"titre":"…","detail":"…","gravite":"haute|moyenne|basse"}],',
  '"questions":[{"titre":"…","options":["…"]}],',
  '"prochaine":"titre de la tâche que tu recommandes"}',
  'Ne recopie pas ces listes dans le texte : le mod les affiche dans le résumé et dans le panneau Tâches.',
].join('\n')

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

export function parseBlock(text: string): Block | null {
  const found = CLOSED.exec(text)
  if (!found) return null
  try {
    const raw = JSON.parse(found[1] ?? '') as Record<string, unknown>
    return {
      realise: list<Done>(raw.realise).filter(d => typeof d?.titre === 'string' || typeof d?.title === 'string').map(d => {
        const one = d as unknown as { titre?: string; title?: string; detail?: string }
        return { title: one.titre ?? one.title ?? '', detail: one.detail }
      }),
      suggestions: list(raw.suggestions),
      corrections: list(raw.corrections),
      questions: list(raw.questions),
      prochaine: typeof raw.prochaine === 'string' ? raw.prochaine : undefined,
    }
  } catch {
    return null
  }
}

export function renderSummary(text: string, isSummary = true): string {
  const block = parseBlock(text)
  if (!block) return text.replace(OPEN, '').trimEnd()
  const body = text.replace(CLOSED, '').trimEnd()
  if (!isSummary) return body
  const lines = block.realise.map(d => `- ✔ **${d.title}**${d.detail ? ` : ${d.detail}` : ''}`)
  const open =
    block.suggestions.length + block.corrections.length + block.questions.length
  const tail = open > 0 ? [`\n_→ ${open} élément(s) dans le panneau Tâches._`] : []
  return [body, lines.length ? `\n**Réalisé**\n${lines.join('\n')}` : '', ...tail]
    .filter(Boolean)
    .join('\n')
}

const norm = (title: string) => title.trim().toLowerCase()

/**
 * Règle le sort des tâches lancées après un tour : « faite » seulement si la réponse les
 * déclare réalisées ; sinon elles restent « en cours » et seront revérifiées au tour suivant.
 */
export function settleTasks(list: Task[], block: Block | null): Task[] {
  return list.map(t => {
    if (t.status !== 'en_cours' || !t.isSent) return t
    const isDone = block?.realise.some(d => {
      const a = norm(d.title)
      const b = norm(t.title)

      return a !== '' && (a.includes(b) || b.includes(a))
    })

    return isDone ? { ...t, status: 'faite' as const } : { ...t, isSent: false }
  })
}

/** Ce que Claude doit savoir du panneau pour ne pas reproposer ce qui y est déjà. */
export function buildBacklog(list: Task[]): string {
  const titles = (statuses: Task['status'][]) =>
    list
      .filter(t => statuses.includes(t.status))
      .slice(-20)
      .map(t => `« ${t.title} »`)
      .join(' ; ')
  const active = titles(['gardee', 'en_cours'])
  const closed = titles(['faite', 'ecartee'])
  if (!active && !closed) return ''

  return [
    'Panneau Tâches : ne repropose pas une tâche déjà présente ci-dessous.',
    active ? `Gardées ou en cours : ${active}.` : '',
    closed ? `Faites ou écartées : ${closed}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const isFinal = (t: Task) => t.status === 'faite' || t.status === 'ecartee'

export function mergeTasks(existing: Task[], block: Block, turn: number, limit = 80): Task[] {
  const kept = existing.filter(
    t => t.status === 'gardee' || t.status === 'en_cours' || t.status === 'ecartee' || (t.status === 'faite' && t.isSent),
  )
  const seen = new Set(kept.map(t => t.title.trim().toLowerCase()))
  const fresh: Task[] = []
  const push = (t: Omit<Task, 'id' | 'status' | 'turn'>, i: number) => {
    const key = t.title.trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    fresh.push({ ...t, id: `${turn}-${t.kind}-${i}`, status: 'proposee', turn })
  }
  block.corrections.forEach((c, i) =>
    push({ kind: 'correction', title: c.titre, detail: c.detail, severity: c.gravite }, i),
  )
  block.questions.forEach((q, i) =>
    push({ kind: 'question', title: q.titre, detail: q.detail, options: q.options }, i),
  )
  block.suggestions.forEach((s, i) => push({ kind: 'suggestion', title: s.titre, detail: s.detail }, i))

  const all = [...kept, ...fresh].slice(-Math.max(limit, 10))
  const target =
    all.find(t => !isFinal(t) && t.title.trim().toLowerCase() === block.prochaine?.trim().toLowerCase()) ??
    all.find(t => t.status === 'proposee' && t.kind === 'correction' && t.severity === 'haute') ??
    all.find(t => t.status === 'proposee' && t.kind === 'suggestion')
  return all.map(t => ({ ...t, isNext: target !== undefined && t.id === target.id }))
}

/** Liste Markdown du panneau : à traiter, gardées, puis historique réalisé. */
export function toMarkdown(list: Task[], finished: Done[]): string {
  const line = (t: Task) => `- ${t.title}${t.detail ? ` : ${t.detail}` : ''}${t.severity === 'haute' ? ' (gravité haute)' : ''}`
  const part = (title: string, lines: string[]) => (lines.length ? [`## ${title}`, ...lines, ''] : [])

  return [
    '# Tâches',
    '',
    ...part('À traiter', list.filter(t => t.status === 'proposee').map(line)),
    ...part('Gardées', list.filter(t => t.status === 'gardee' || t.status === 'en_cours').map(line)),
    ...part('Réalisé', finished.map(d => `- ✔ ${d.title}${d.detail ? ` : ${d.detail}` : ''}`)),
  ]
    .join('\n')
    .trimEnd()
}

/** Vrai quand une réponse assez longue n'a pas de bloc exploitable : le panneau n'a rien reçu. */
export const isMissingBlock = (answer: string, block: Block | null) => block === null && answer.trim().length >= 400

export const EXTRACT_SYSTEM =
  'Tu lis la réponse d’un assistant de développement et tu en extrais ce qu’elle a réalisé, suggéré, corrigé ou demandé. ' +
  'Réponds uniquement par ce JSON, sans commentaire ni balises : ' +
  '{"realise":[{"titre":"…","detail":"description fonctionnelle"}],"suggestions":[{"titre":"…","detail":"…"}],' +
  '"corrections":[{"titre":"…","detail":"…","gravite":"haute|moyenne|basse"}],"questions":[{"titre":"…","options":["…"]}],"prochaine":"titre recommandé"}'

/** Lit la réponse d'un modèle chargé d'extraire un bloc : le JSON est repris tel quel dans un bloc workbench. */
export const parseExtraction = (text: string) =>
  parseBlock('```workbench\n' + text.replace(/```(?:json|workbench)?/g, '').trim() + '\n```')

const LABELS: Record<string, string> = {
  Read: 'Lecture d’un fichier',
  Grep: 'Recherche dans le code',
  Glob: 'Recherche de fichiers',
  Edit: 'Modification du code',
  Write: 'Écriture d’un fichier',
  NotebookEdit: 'Modification d’un notebook',
  Bash: 'Exécution d’une commande',
  WebFetch: 'Lecture d’une page web',
  WebSearch: 'Recherche sur le web',
  Agent: 'Délégation à un sous-agent',
  Artifact: 'Publication d’une page',
}

/** Libellé fonctionnel d'un appel d'outil, sans chemin ni commande. */
export function describeCall(tool: string): string {
  return LABELS[tool] ?? (tool.startsWith('mcp__') ? 'Appel à un service connecté' : 'Action en cours')
}

/** Ligne de progression d'un groupe d'appels ; null s'il n'y a rien d'actif à montrer. */
export function progressLine(calls: ReadonlyArray<{ tool: string; isRunning: boolean }>): string | null {
  const running = calls.filter(c => c.isRunning)
  if (running.length === 0) return null
  const last = running[running.length - 1]
  const finished = calls.length - running.length

  return `${describeCall(last.tool)}…${finished > 0 ? ` (${finished} étape${finished > 1 ? 's' : ''} faite${finished > 1 ? 's' : ''})` : ''}`
}

export type Breath = { label: string; bar: string; cycles: number; elapsed: string }

const WIDTH = 12
const PHASES = ['Inspire', 'Retiens', 'Expire', 'Retiens'] as const

/** Respiration carrée 4-4-4-4 pour la seconde `beat` (0 = départ) : la barre monte à l'inspiration, descend à l'expiration, reste pleine ou vide pendant les pauses. */
export function breathFrame(beat: number): Breath {
  const inCycle = beat % 16
  const phase = Math.floor(inCycle / 4)
  const step = (inCycle % 4) + 1
  const level = [step / 4, 1, 1 - step / 4, 0][phase]
  const length = Math.round(level * WIDTH)
  const mm = String(Math.floor(beat / 60)).padStart(2, '0')
  const ss = String(beat % 60).padStart(2, '0')

  return {
    label: `${PHASES[phase]} ${5 - step}`,
    bar: '█'.repeat(length) + '░'.repeat(WIDTH - length),
    cycles: Math.floor(beat / 16),
    elapsed: `${mm}:${ss}`,
  }
}
