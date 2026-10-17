export type EnhancerStatus = 'idle' | 'working' | 'error'

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': { status: EnhancerStatus; previous: string | null }
  }
}
