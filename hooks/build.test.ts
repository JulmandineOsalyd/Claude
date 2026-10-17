import { test, expect } from 'claude-code/testing'

import { buildPrompt, cleanOutput, formatHistory } from './build'

test('keeps the last 6 messages and clips long ones', () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({
    role: 'user' as const,
    text: i === 9 ? 'x'.repeat(2000) : `m${i}`,
  }))
  const h = formatHistory(msgs)
  expect(h.split('\n').length).toBe(6)
  expect(h.includes('[tronqué]')).toBe(true)
  expect(h.includes('m3')).toBe(false)
})

test('omits <historique> when there is none', () => {
  expect(buildPrompt('', 'salut').includes('<historique>')).toBe(false)
  expect(buildPrompt('[user] a', 'salut').includes('<historique>')).toBe(true)
})

test('strips fences and wrapper tags from the reply', () => {
  expect(cleanOutput('```\nbonjour\n```')).toBe('bonjour')
  expect(cleanOutput('<prompt_a_ameliorer>\nbonjour\n</prompt_a_ameliorer>')).toBe('bonjour')
})
