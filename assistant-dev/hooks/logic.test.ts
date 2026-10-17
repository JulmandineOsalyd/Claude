import { expect, test } from 'claude-code/testing'

import { advise, breathFrame, mergeTasks, parseBlock, renderSummary } from './logic'

const answer =
  'Fait.\n```workbench\n{"realise":[{"titre":"Auth","detail":"token renouvelé"}],"suggestions":[{"titre":"Ajouter des tests"}],"corrections":[],"questions":[],"prochaine":"Ajouter des tests"}\n```'

test('le bloc est lu et remplacé par un résumé', () => {
  expect(parseBlock(answer)?.realise[0]?.title).toBe('Auth')
  expect(renderSummary(answer)).toContain('✔ **Auth**')
  expect(renderSummary(answer)).not.toContain('workbench')
})

test('un bloc non fermé est masqué pendant le streaming', () => {
  expect(renderSummary('Texte\n```workbench\n{"real')).toBe('Texte')
})

test('les tâches gardées survivent, les doublons sont ignorés', () => {
  const block = parseBlock(answer)!
  const first = mergeTasks([], block, 1)
  expect(first[0]?.isNext).toBe(true)
  const kept = first.map(t => ({ ...t, status: 'gardee' as const }))
  expect(mergeTasks(kept, block, 2)).toHaveLength(1)
})

test('compact : seulement aux moments opportuns, avec la raison', () => {
  const base = { percent: 50, growth: 2, reason: 'answer', doneCount: 0, isNewTopic: false, isBlocked: false, turn: 10, sinceLast: 20, dismissal: null }
  expect(advise(base)).toBeNull()
  expect(advise({ ...base, doneCount: 2 })?.reason).toContain('Tâche majeure')
  expect(advise({ ...base, doneCount: 1 })).toBeNull()
  expect(advise({ ...base, percent: 30, isNewTopic: true })?.reason).toContain('Changement de sujet')
  expect(advise({ ...base, growth: 15 })?.reason).toContain('sorties d’outils')
  expect(advise({ ...base, percent: 85 })?.isUrgent).toBe(true)
  expect(advise({ ...base, doneCount: 3, sinceLast: 2 })).toBeNull()
  expect(advise({ ...base, doneCount: 3, isBlocked: true })).toBeNull()
  expect(advise({ ...base, doneCount: 3, dismissal: { turn: 9, percent: 50 } })).toBeNull()
})

test('respiration 4-4-4-4 : inspire, retiens, expire, retiens', () => {
  expect(breathFrame(0).label).toBe('Inspire 4')
  expect(breathFrame(3).label).toBe('Inspire 1')
  expect(breathFrame(3).bar).toBe('█'.repeat(12))
  expect(breathFrame(4).label).toBe('Retiens 4')
  expect(breathFrame(4).bar).toBe('█'.repeat(12))
  expect(breathFrame(8).label).toBe('Expire 4')
  expect(breathFrame(11).bar).toBe('░'.repeat(12))
  expect(breathFrame(12).label).toBe('Retiens 4')
  expect(breathFrame(12).bar).toBe('░'.repeat(12))
  expect(breathFrame(33).cycles).toBe(2)
  expect(breathFrame(65).elapsed).toBe('01:05')
})
