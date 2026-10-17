export const MAX_MESSAGES = 6
export const MAX_CHARS = 1500

type Msg = { role: 'user' | 'assistant'; text: string }

const clip = (s: string) =>
  s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}…[tronqué]` : s

export function formatHistory(messages: readonly Msg[]): string {
  return messages
    .filter(m => m.text.trim() !== '')
    .slice(-MAX_MESSAGES)
    .map(m => `[${m.role}] ${clip(m.text.trim())}`)
    .join('\n')
}

export function buildPrompt(history: string, draft: string): string {
  const parts: string[] = []
  if (history !== '') parts.push(`<historique>\n${history}\n</historique>`)
  parts.push(`<prompt_a_ameliorer>\n${draft}\n</prompt_a_ameliorer>`)
  return parts.join('\n\n')
}

export function cleanOutput(text: string): string {
  let out = text.trim()
  const fence = out.match(/^```[a-z]*\n([\s\S]*?)\n```$/i)
  if (fence) out = fence[1].trim()
  const tag = out.match(/^<prompt_a_ameliorer>\n?([\s\S]*?)\n?<\/prompt_a_ameliorer>$/)
  if (tag) out = tag[1].trim()
  return out
}
