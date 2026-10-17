export type Kind = 'suggestion' | 'correction' | 'question'
export type Status = 'proposee' | 'gardee' | 'en_cours' | 'faite' | 'ecartee'
export type Severity = 'haute' | 'moyenne' | 'basse'

export type Task = {
  id: string
  kind: Kind
  title: string
  detail?: string
  severity?: Severity
  options?: string[]
  status: Status
  isNext?: boolean
  isSent?: boolean
  turn: number
}

export type Done = { title: string; detail?: string }

export type Advice = { reason: string; isUrgent: boolean; percent: number } | null

export type Dismissal = { turn: number; percent: number } | null

declare module 'claude-code' {
  interface PluginState {
    'assistant-dev': {
      tasks: Task[]
      done: Done[]
      advice: Advice
      dismissal: Dismissal
      showDetail: boolean
      tab: 'courant' | 'gardees'
      beat: number
    }
  }
}
