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

declare module 'claude-code' {
  interface PluginState {
    'assistant-dev': {
      tasks: Task[]
      done: Done[]
      showDetail: boolean
      expanded: string[]
      tab: 'courant' | 'gardees' | 'faites'
      beat: number
    }
  }
}
