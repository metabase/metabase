import { match } from "ts-pattern";
import { t } from "ttag";

import { getIssueTypeLabel } from "metabase/metabot/components/MetabotChat/feedback-issue-types";
import { Badge, type BadgeColor, Group } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";

import type { ConversationIssue, ConversationReviewLabel } from "../../types";

export const getConversationIssueLabel = (issue: ConversationIssue): string =>
  match(issue)
    .with("system-failure", () => t`System failure`)
    .with("unfulfilled", () => t`Request not fulfilled`)
    .with("degraded-delivery", () => t`Degraded after tool error`)
    .with("high-frustration", () => t`High frustration`)
    .with("impossible-request", () => t`Impossible request`)
    .with("vague-request", () => t`Vague request`)
    .with(
      "overall-refusal",
      "did-not-follow-request",
      "took-incorrect-actions",
      "incomplete-response",
      (selfReportedType) => getIssueTypeLabel(selfReportedType),
    )
    .exhaustive();

const LABEL_COLORS = {
  failed: "negative",
  friction: "warning",
  ok: "neutral",
} satisfies Record<ConversationReviewLabel, BadgeColor>;

type ConversationIssuesProps = {
  label: ConversationReviewLabel | null;
  issues: readonly ConversationIssue[];
  needsReview: boolean;
};

export function ConversationIssues({
  label,
  issues,
  needsReview,
}: ConversationIssuesProps) {
  if (label == null) {
    return EMPTY_CELL_PLACEHOLDER;
  }

  return (
    <Group gap="xs" wrap="wrap" data-testid="conversation-issues">
      {issues.map((issue) => (
        <Badge
          key={issue}
          color={LABEL_COLORS[label]}
          variant={label === "ok" ? "outline" : "light"}
          size="sm"
        >
          {getConversationIssueLabel(issue)}
        </Badge>
      ))}
      {needsReview && (
        <Badge color="neutral" variant="outline" size="sm">
          {t`Needs review`}
        </Badge>
      )}
    </Group>
  );
}
