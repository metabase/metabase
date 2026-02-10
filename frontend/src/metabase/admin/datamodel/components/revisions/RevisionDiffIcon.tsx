import type { DatasetQuery } from "metabase-types/api";

import { EditIcon, ErrorIcon, SuccessIcon } from "./RevisionDiff.styled";

interface Props {
  diff: {
    before?: DatasetQuery;
    after?: DatasetQuery;
  };
}

export function RevisionDiffIcon({ diff }: Props) {
  const { before, after } = diff;

  if (before != null && after != null) {
    return <EditIcon name="pencil" size={16} />;
  }

  if (before != null) {
    return <ErrorIcon name="add" size={16} />;
  }

  // TODO: "minus" icon
  return <SuccessIcon name="add" size={16} />;
}
