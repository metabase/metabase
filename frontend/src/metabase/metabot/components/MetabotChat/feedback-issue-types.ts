import { t } from "ttag";

export const ISSUE_TYPE_VALUES = [
  "ui-bug",
  "took-incorrect-actions",
  "overall-refusal",
  "did-not-follow-request",
  "not-factual",
  "incomplete-response",
  "other",
] as const;

export type IssueType = (typeof ISSUE_TYPE_VALUES)[number];

export const getIssueTypeLabel = (value: string): string => {
  switch (value) {
    case "ui-bug":
      return t`UI bug`;
    case "took-incorrect-actions":
      return t`Took incorrect actions`;
    case "overall-refusal":
      return t`Overall refusal`;
    case "did-not-follow-request":
      return t`Did not follow request`;
    case "not-factual":
      return t`Not factually correct`;
    case "incomplete-response":
      return t`Incomplete response`;
    case "other":
      return t`Other`;
    default:
      return value;
  }
};

export const getIssueTypeOptions = () =>
  ISSUE_TYPE_VALUES.map((value) => ({
    value,
    label: getIssueTypeLabel(value),
  }));
