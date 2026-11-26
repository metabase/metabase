import { msgid, ngettext, t } from "ttag";

import { Text } from "metabase/ui";
import { formatDurationLong } from "metabase/utils/formatting/duration";
import type { MessageTiming } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/types";

function getLlmCallsLabel({ llm_calls }: MessageTiming): string | null {
  const count = llm_calls.length;
  if (count === 0) {
    return null;
  }
  const calls = ngettext(msgid`${count} LLM call`, `${count} LLM calls`, count);
  const durations = llm_calls.flatMap(({ duration_ms }) =>
    duration_ms == null ? [] : [duration_ms],
  );
  if (durations.length === 0) {
    return calls;
  }
  const duration = formatDurationLong(
    durations.reduce((sum, durationMs) => sum + durationMs, 0),
  );
  return t`${calls} (${duration})`;
}

function getToolCallsLabel({ tool_calls }: MessageTiming): string | null {
  const count = tool_calls.length;
  return count === 0
    ? null
    : ngettext(msgid`${count} tool call`, `${count} tool calls`, count);
}

/**
 * One line under a reply: how long the server worked on it, and how many LLM
 * calls and tool calls it made. The LLM time is the sum over the attempts.
 * Tool calls run in parallel, so they show a count and no sum.
 */
export function MessageTimingSummary({ timing }: { timing: MessageTiming }) {
  const labels = [
    timing.duration_ms == null
      ? null
      : t`Worked for ${formatDurationLong(timing.duration_ms)}`,
    getLlmCallsLabel(timing),
    getToolCallsLabel(timing),
  ].filter((label) => label != null);

  if (labels.length === 0) {
    return null;
  }

  return (
    <Text size="sm" c="text-secondary" data-testid="metabot-message-timing">
      {labels.join(" · ")}
    </Text>
  );
}
