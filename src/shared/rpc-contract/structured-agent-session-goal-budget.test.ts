import { describe, expect, it } from 'vitest'
import { ThreadGoalParams } from './structured-agent-session-params'

const envelope = {
  sessionId: 'session-1',
  clientOperationId: 'budget-edit',
  expectedRuntimeFence: 1,
  payloadFingerprint: 'a'.repeat(64)
}
describe('strict native goal budget request', () => {
  it('accepts explicit positive safe integers only', () => {
    for (const tokenBudget of [1, 40_000, Number.MAX_SAFE_INTEGER]) {
      expect(
        ThreadGoalParams.safeParse({ envelope, change: { kind: 'budget', tokenBudget } }).success
      ).toBe(true)
    }
    for (const tokenBudget of [
      0,
      -1,
      1.5,
      Number.NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      null,
      undefined,
      '40000'
    ]) {
      expect(
        ThreadGoalParams.safeParse({ envelope, change: { kind: 'budget', tokenBudget } }).success
      ).toBe(false)
    }
  })
  it('rejects objective/status changes hidden inside a budget edit', () => {
    for (const extra of [
      { objective: 'replacement' },
      { status: 'paused' },
      { origin: 'automatic' }
    ]) {
      expect(
        ThreadGoalParams.safeParse({
          envelope,
          change: { kind: 'budget', tokenBudget: 40_000, ...extra }
        }).success
      ).toBe(false)
    }
  })
})
