import { Icon } from "metabase/ui";
import type { FieldDiff } from "metabase-types/api";

interface Props {
  diff: FieldDiff;
}

export function RevisionDiffIcon({ diff }: Props) {
  const { before, after } = diff;

  if (before != null && after != null) {
    return <Icon name="pencil" size={16} c="core-brand" />;
  }

  if (before != null) {
    return <Icon name="add" size={16} c="feedback-negative" />;
  }

  // TODO: "minus" icon
  return <Icon name="add" size={16} c="core-summarize" />;
}
