import type { Advice, Dismissal, Done, Severity, Task } from '../types'

export type Block = {
  realise: Done[]
  suggestions: { titre: string; detail?: string }[]
  corrections: { titre: string; detail?: string; gravite?: Severity }[]
  questions: { titre: string; detail?: string; options?: string[] }[]
  prochaine?: string
  bloque?: boolean
  nouveauSujet?: boolean
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
  '"prochaine":"titre de la tâche que tu recommandes","bloque":false,"nouveau_sujet":false}',
  '"bloque" vaut true si un test ou une commande échoue sans être résolu.',
  '"nouveau_sujet" vaut true quand la demande de l’utilisateur n’a plus de lien avec le travail précédent.',
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
      bloque: raw.bloque === true,
      nouveauSujet: raw.nouveau_sujet === true,
    }
  } catch {
    return null
  }
}

export function renderSummary(text: string): string {
  const block = parseBlock(text)
  if (!block) return text.replace(OPEN, '').trimEnd()
  const body = text.replace(CLOSED, '').trimEnd()
  const lines = block.realise.map(d => `- ✔ **${d.title}**${d.detail ? ` : ${d.detail}` : ''}`)
  const open =
    block.suggestions.length + block.corrections.length + block.questions.length
  const tail = open > 0 ? [`\n_→ ${open} élément(s) dans le panneau Tâches._`] : []
  return [body, lines.length ? `\n**Réalisé**\n${lines.join('\n')}` : '', ...tail]
    .filter(Boolean)
    .join('\n')
}

const isFinal = (t: Task) => t.status === 'faite' || t.status === 'ecartee'

export function mergeTasks(existing: Task[], block: Block, turn: number): Task[] {
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

  const all = [...kept, ...fresh].slice(-80)
  const target =
    all.find(t => !isFinal(t) && t.title.trim().toLowerCase() === block.prochaine?.trim().toLowerCase()) ??
    all.find(t => t.status === 'proposee' && t.kind === 'correction' && t.severity === 'haute') ??
    all.find(t => t.status === 'proposee' && t.kind === 'suggestion')
  return all.map(t => ({ ...t, isNext: target !== undefined && t.id === target.id }))
}

export type AdviceInput = {
  percent: number
  growth: number
  reason: string
  doneCount: number
  isNewTopic: boolean
  isBlocked: boolean
  turn: number
  sinceLast: number
  dismissal: Dismissal
}

// La proposition n'apparaît qu'à des moments précis, et dit toujours pourquoi.
export function advise(i: AdviceInput): Advice {
  if (i.isBlocked || i.reason !== 'answer') return null
  const snoozed =
    i.dismissal !== null && i.turn - i.dismissal.turn < 3 && i.percent < i.dismissal.percent + 15
  if (snoozed) return null
  const pct = `${Math.round(i.percent)} % de contexte`
  const make = (reason: string, isUrgent = false): Advice => ({ reason, isUrgent, percent: i.percent })
  if (i.percent >= 80)
    return make(`Contexte presque plein (${pct}) : au-delà, les réponses se dégradent et un compactage automatique risque de tomber au mauvais moment.`, true)
  if (i.sinceLast < 6) return null
  if (i.isNewTopic && i.percent >= 25)
    return make(`Changement de sujet (${pct}) : l’historique précédent ne sert plus et alourdit les réponses.`)
  if (i.growth >= 12 && i.percent >= 45)
    return make(`Ce tour a ajouté ${Math.round(i.growth)} points de contexte (${pct}), surtout des sorties d’outils déjà exploitées et inutiles à garder.`)
  if (i.doneCount >= 2 && i.percent >= 40)
    return make(`Tâche majeure terminée : ${i.doneCount} actions réalisées (${pct}). Les décisions sont acquises, c’est un bon point de coupure.`)
  if (i.percent >= 60)
    return make(`Contexte chargé (${pct}) : compacter maintenant coûte moins que d’attendre la saturation.`)
  return null
}

export function buildInstructions(tasks: Task[], done: Done[]): string {
  const keep = tasks.filter(t => t.status === 'gardee' || t.status === 'en_cours')
  const questions = tasks.filter(t => t.kind === 'question' && t.status === 'proposee')
  return [
    'Conserve : les tâches gardées et leur statut, les questions sans réponse, les décisions prises par l’utilisateur, et le résumé fonctionnel des tâches réalisées. Ignore les sorties brutes d’outils.',
    keep.length ? `Tâches gardées : ${keep.map(t => `${t.title} [${t.status}]`).join(' ; ')}` : '',
    questions.length ? `Questions ouvertes : ${questions.map(t => t.title).join(' ; ')}` : '',
    done.length ? `Déjà réalisé : ${done.slice(-20).map(d => d.title).join(' ; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

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
