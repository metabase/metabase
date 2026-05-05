import { match } from "ts-pattern";
import { t } from "ttag";

import {
  METABOT_ISSUE_TYPE_VALUES,
  type MetabotIssueType,
} from "metabase-types/api";

export const getIssueTypeLabel = (value: MetabotIssueType): string =>
  match(value)
    .with("ui-bug", () => t`UI bug`)
    .with("took-incorrect-actions", () => t`Took incorrect actions`)
    .with("overall-refusal", () => t`Overall refusal`)
    .with("did-not-follow-request", () => t`Did not follow request`)
    .with("not-factual", () => t`Not factually correct`)
    .with("incomplete-response", () => t`Incomplete response`)
    .with("other", () => t`Other`)
    .exhaustive();

export const issueTypeOptions = METABOT_ISSUE_TYPE_VALUES.map((value) => ({
  value,
  label: getIssueTypeLabel(value),
}));
