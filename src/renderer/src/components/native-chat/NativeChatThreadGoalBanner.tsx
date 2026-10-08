import { useEffect, useId, useState } from 'react'
import { ChevronDown, ChevronUp, Goal, Pause, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { AgentJournalThreadGoal } from '../../../../shared/agent-session-journal-types'
import {
  agentSessionThreadGoalElapsedSeconds,
  agentSessionThreadGoalStatusChange
} from '../../../../shared/agent-session-thread-goal'
import type { AgentSessionThreadGoalChange } from '../../../../shared/agent-session-wire'
import {
  formatNativeChatThreadGoalElapsed,
  nativeChatThreadGoalStatusLabel
} from './native-chat-thread-goal-presentation'

function GoalAction(props: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={props.label}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {props.label}
      </TooltipContent>
    </Tooltip>
  )
}

function GoalBudgetEditor(props: {
  goal: AgentJournalThreadGoal
  pending: boolean
  onChange: (change: AgentSessionThreadGoalChange) => void
}): React.JSX.Element {
  const inputId = useId()
  const [draft, setDraft] = useState(props.goal.tokenBudget?.toString() ?? '')
  useEffect(() => setDraft(props.goal.tokenBudget?.toString() ?? ''), [props.goal.tokenBudget])
  const amount = /^[1-9]\d*$/.test(draft) ? Number(draft) : Number.NaN
  const valid = Number.isSafeInteger(amount) && amount > props.goal.tokensUsed
  const disabled = props.pending || !valid || amount === props.goal.tokenBudget
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 pb-2 text-xs"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled) {
          props.onChange({ kind: 'budget', tokenBudget: amount })
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="block pb-1">
          {translate('components.native-chat.goal.totalTokenBudget', 'Total token budget')}
        </label>
        <Input
          id={inputId}
          inputMode="numeric"
          value={draft}
          disabled={props.pending}
          onChange={(event) => setDraft(event.target.value)}
          aria-describedby={`${inputId}-help`}
        />
        <p id={`${inputId}-help`} className="pt-1 text-muted-foreground">
          {translate('components.native-chat.goal.tokensUsed', 'Tokens used')}:{' '}
          {props.goal.tokensUsed.toLocaleString()}.{' '}
          {translate(
            'components.native-chat.goal.budgetAboveUsage',
            'Enter a whole-number total above usage. Saving keeps the current goal and status.'
          )}
        </p>
      </div>
      <Button type="submit" size="sm" disabled={disabled}>
        {translate('components.native-chat.goal.applyBudget', 'Apply budget')}
      </Button>
    </form>
  )
}

/** The session's open goal, as a strip attached to the top of the composer. */
export function NativeChatThreadGoalBanner(props: {
  goal: AgentJournalThreadGoal
  pending: boolean
  isVisible: boolean
  /** The session's running turn, or null when idle; goal time accrues only while one runs. */
  runningTurn: { startedAt: number | null } | null
  onChange: (change: AgentSessionThreadGoalChange) => void
}): React.JSX.Element | null {
  const { goal, pending, onChange } = props
  const [expanded, setExpanded] = useState(false)
  const { runningTurn } = props
  const now = useNow(1_000, props.isVisible && goal.status === 'active' && runningTurn !== null)
  const label = nativeChatThreadGoalStatusLabel(goal.status)
  const statusChange = agentSessionThreadGoalStatusChange(goal.status)
  if (label === null) {
    return null
  }
  const elapsed = formatNativeChatThreadGoalElapsed(
    agentSessionThreadGoalElapsedSeconds(goal, now, runningTurn)
  )
  const expandLabel = expanded
    ? translate('components.native-chat.goal.collapse', 'Hide full goal')
    : translate('components.native-chat.goal.expand', 'Show full goal')
  return (
    // Pulled over the composer's top padding so the strip sits on the input box.
    <div
      className="group/goal relative -mb-2 shrink-0 px-3 sm:px-4"
      data-native-chat-thread-goal={goal.status}
    >
      <div className="mx-auto w-full max-w-(--chat-content-max-width) px-2">
        {/* Right after the task strip, that strip's bottom border is this tab's top edge. */}
        <div className="flex items-start gap-2 rounded-t-md border border-b-0 border-border bg-muted/30 py-1 pr-1 pl-3 text-xs text-muted-foreground group-[[data-native-chat-background-tasks]+&]/goal:rounded-t-none group-[[data-native-chat-background-tasks]+&]/goal:border-t-0">
          <Goal aria-hidden className="mt-1 size-3.5 shrink-0" />
          <p className={cn('min-w-0 flex-1 py-0.5', expanded ? 'break-words' : 'truncate')}>
            <span className="font-semibold text-foreground">{label}</span>{' '}
            <span>{goal.objective}</span>
            <span className="tabular-nums">{` • ${elapsed}`}</span>
          </p>
          <div className="flex shrink-0 items-center">
            <GoalAction
              label={translate('components.native-chat.goal.clear', 'Clear goal')}
              disabled={pending}
              onClick={() => onChange({ kind: 'clear' })}
            >
              <Trash2 className="size-3.5" />
            </GoalAction>
            {statusChange === 'paused' ? (
              <GoalAction
                label={translate('components.native-chat.goal.pause', 'Pause goal')}
                disabled={pending}
                onClick={() => onChange({ kind: 'status', status: 'paused' })}
              >
                <Pause className="size-3.5" />
              </GoalAction>
            ) : statusChange === 'active' ? (
              <GoalAction
                label={translate('components.native-chat.goal.resume', 'Resume goal')}
                disabled={pending}
                onClick={() => onChange({ kind: 'status', status: 'active' })}
              >
                <Play className="size-3.5" />
              </GoalAction>
            ) : null}
            <GoalAction label={expandLabel} disabled={false} onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </GoalAction>
          </div>
        </div>
        {expanded ? (
          <GoalBudgetEditor
            key={goal.createdAt}
            goal={goal}
            pending={pending}
            onChange={onChange}
          />
        ) : null}
      </div>
    </div>
  )
}
