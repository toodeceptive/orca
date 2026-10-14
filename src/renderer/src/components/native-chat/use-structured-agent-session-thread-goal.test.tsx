// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  AgentJournalRenderItem,
  AgentJournalThreadGoal
} from '../../../../shared/agent-session-journal-types'
import type { AgentSessionOptionsResult } from '../../../../shared/agent-session-wire'
import type { StructuredAgentSessionMutate } from './use-structured-agent-session-mutate'
import { useStructuredAgentSessionThreadGoal } from './use-structured-agent-session-thread-goal'

const GOAL: AgentJournalThreadGoal = {
  objective: 'Ship the parser',
  status: 'active',
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 0,
  createdAt: 1_000,
  updatedAt: 1_000
}

function goalRow(sequence: number, goal: AgentJournalThreadGoal): AgentJournalRenderItem {
  return {
    itemId: `goal-${sequence}`,
    revision: 1,
    sequence,
    observedAt: sequence,
    body: {
      kind: 'status',
      text: `Goal set: ${goal.objective}`,
      threadGoal: { state: 'set', goal }
    }
  }
}

function clearedRow(sequence: number): AgentJournalRenderItem {
  return {
    itemId: `goal-${sequence}`,
    revision: 1,
    sequence,
    observedAt: sequence,
    body: { kind: 'status', text: 'Goal cleared', threadGoal: { state: 'cleared' } }
  }
}

type MutateCall = (...args: unknown[]) => Promise<unknown>

/** The hook reads only whether an answer is null, so a mock need not carry the generic. */
function mutateWith(answer: MutateCall): {
  mutate: StructuredAgentSessionMutate
  calls: MutateCall
} {
  const calls = vi.fn(answer)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook never narrows the answer beyond null.
  return { mutate: calls as unknown as StructuredAgentSessionMutate, calls }
}

function harness(options: {
  journalItems?: readonly AgentJournalRenderItem[]
  support?: { current: AgentJournalThreadGoal | null; canChangeBudget?: boolean }
  mutate?: StructuredAgentSessionMutate
}) {
  const mutate = options.mutate ?? mutateWith(async () => null).mutate
  return renderHook(() =>
    useStructuredAgentSessionThreadGoal({
      journalItems: options.journalItems ?? [],
      support: options.support,
      mutate
    })
  )
}

describe('useStructuredAgentSessionThreadGoal', () => {
  it('is absent until the host reports it can change this session goal', () => {
    expect(harness({ journalItems: [goalRow(1, GOAL)] }).result.current).toBeNull()
  })

  it.each([undefined, false, true])(
    'requires explicit budget capability %s',
    async (canChangeBudget) => {
      const { mutate, calls } = mutateWith(async () => ({ change: 'budget' }))
      const { result } = harness({ support: { current: GOAL, canChangeBudget }, mutate })
      expect(result.current?.canChangeBudget).toBe(canChangeBudget === true)
      await act(async () => {
        await expect(result.current!.change({ kind: 'budget', tokenBudget: 40_000 })).resolves.toBe(
          canChangeBudget === true
        )
      })
      expect(calls).toHaveBeenCalledTimes(canChangeBudget === true ? 1 : 0)
      expect(result.current?.goal).toEqual(GOAL)
      await act(async () => {
        await result.current!.change({ kind: 'clear' })
      })
      expect(calls).toHaveBeenCalledTimes(canChangeBudget === true ? 2 : 1)
    }
  )

  it('reads the goal off the loaded window, and off the host answer only when the window has none', () => {
    const older = { ...GOAL, objective: 'Older goal' }
    const fromWindow = harness({ journalItems: [goalRow(1, GOAL)], support: { current: older } })
    expect(fromWindow.result.current?.goal).toEqual(GOAL)

    const fromHost = harness({ support: { current: older } })
    expect(fromHost.result.current?.goal).toEqual(older)

    // A clear in the window outranks a host answer read before it.
    const cleared = harness({ journalItems: [clearedRow(2)], support: { current: older } })
    expect(cleared.result.current?.goal).toBeNull()
  })

  it('keeps context floors and changing budget capability independent while an edit is pending', async () => {
    const reply = Promise.withResolvers<{ change: 'budget' }>()
    const { mutate, calls } = mutateWith(() => reply.promise)
    const journalItems = [goalRow(2, GOAL)]
    const support: NonNullable<AgentSessionOptionsResult['threadGoal']> = {
      current: null,
      contextFloor: { epoch: 'old-journal', sequence: 3 },
      canChangeBudget: false
    }
    const { result, rerender } = renderHook(
      (props: { support: typeof support; journalEpoch: string }) =>
        useStructuredAgentSessionThreadGoal({ journalItems, mutate, ...props }),
      { initialProps: { support, journalEpoch: 'old-journal' } }
    )
    expect(result.current?.goal).toBeNull()
    await act(async () => {
      await expect(result.current!.change({ kind: 'budget', tokenBudget: 40_000 })).resolves.toBe(
        false
      )
    })
    expect(calls).not.toHaveBeenCalled()

    rerender({ support: { ...support, canChangeBudget: true }, journalEpoch: 'new-journal' })
    expect(result.current?.goal).toEqual(GOAL)
    let pending: Promise<boolean> = Promise.resolve(false)
    act(() => {
      pending = result.current!.change({ kind: 'budget', tokenBudget: 40_000 })
    })
    expect(result.current?.pending).toBe(true)
    rerender({ support, journalEpoch: 'new-journal' })
    expect(result.current?.canChangeBudget).toBe(false)
    expect(result.current?.goal).toEqual(GOAL)
    await act(async () => {
      await expect(result.current!.change({ kind: 'budget', tokenBudget: 50_000 })).resolves.toBe(
        false
      )
    })
    expect(calls).toHaveBeenCalledExactlyOnceWith(
      'agentSession.threadGoal',
      'agentSession.threadGoal',
      { change: { kind: 'budget', tokenBudget: 40_000 } }
    )
    await act(async () => reply.resolve({ change: 'budget' }))
    await expect(pending).resolves.toBe(true)
    expect(result.current?.pending).toBe(false)
    rerender({
      support: { ...support, contextFloor: { epoch: 'new-journal', sequence: 3 } },
      journalEpoch: 'new-journal'
    })
    expect(result.current?.goal).toBeNull()
  })

  it('serializes changes: a second submit while one is unsettled is answered false, not sent', async () => {
    let settle: (value: { change: 'set' } | null) => void = () => undefined
    const { mutate, calls } = mutateWith(
      () => new Promise<{ change: 'set' } | null>((resolve) => (settle = resolve))
    )
    const { result } = harness({ support: { current: null }, mutate })

    let first: Promise<boolean> = Promise.resolve(false)
    let second: Promise<boolean> = Promise.resolve(false)
    act(() => {
      first = result.current!.change({ kind: 'set', objective: 'Ship the parser' })
      second = result.current!.change({ kind: 'set', objective: 'Ship the parser' })
    })
    await expect(second).resolves.toBe(false)
    expect(calls).toHaveBeenCalledTimes(1)
    expect(calls).toHaveBeenCalledWith('agentSession.threadGoal', 'agentSession.threadGoal', {
      change: { kind: 'set', objective: 'Ship the parser' }
    })
    expect(result.current?.pending).toBe(true)

    await act(async () => settle({ change: 'set' }))
    await expect(first).resolves.toBe(true)
    expect(result.current?.pending).toBe(false)
  })

  it('answers false for a refused or unsent change and accepts the next one', async () => {
    const { mutate, calls } = mutateWith(async () => null)
    const { result } = harness({ support: { current: GOAL }, mutate })

    await act(async () => {
      await expect(result.current!.change({ kind: 'clear' })).resolves.toBe(false)
    })
    await act(async () => {
      await expect(result.current!.change({ kind: 'clear' })).resolves.toBe(false)
    })
    expect(calls).toHaveBeenCalledTimes(2)
    expect(result.current?.pending).toBe(false)
  })
})
