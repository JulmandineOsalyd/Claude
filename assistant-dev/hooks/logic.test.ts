import { expect, test } from 'claude-code/testing'

import { breathFrame, buildBacklog, mergeTasks, parseBlock, renderSummary, settleTasks } from './logic'

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

test('une tâche lancée n’est faite que si la réponse la déclare réalisée', () => {
  const sent = { id: 'a', kind: 'suggestion' as const, title: 'Ajouter des tests', status: 'en_cours' as const, isSent: true, turn: 1 }
  const block = parseBlock(answer)!
  expect(settleTasks([sent], { ...block, realise: [{ title: 'Auth' }] })[0]).toMatchObject({ status: 'en_cours', isSent: false })
  expect(settleTasks([sent], null)[0]).toMatchObject({ status: 'en_cours', isSent: false })
  expect(settleTasks([sent], { ...block, realise: [{ title: 'Ajouter des tests unitaires' }] })[0]?.status).toBe('faite')
  expect(settleTasks([{ ...sent, isSent: false }], null)[0]?.status).toBe('en_cours')
})

test('le panneau dit à Claude ce qu’il ne doit pas reproposer', () => {
  expect(buildBacklog([])).toBe('')
  const t = { id: 'a', kind: 'suggestion' as const, title: 'Ajouter des tests', status: 'ecartee' as const, turn: 1 }
  expect(buildBacklog([t])).toContain('Faites ou écartées : « Ajouter des tests »')
  expect(buildBacklog([{ ...t, status: 'gardee' as const }])).toContain('Gardées ou en cours : « Ajouter des tests »')
})
