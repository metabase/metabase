import { t } from "ttag";

import type {
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import type { ReplaceSourceErrorGroup } from "./types";

export function getErrorGroups(
  errors: ReplaceSourceError[],
): ReplaceSourceErrorGroup[] {
  const groups: Partial<Record<ReplaceSourceErrorType, ReplaceSourceError[]>> =
    {};

  errors.forEach((error) => {
    const group = groups[error.type];
    group?.push(error);
  });

  return Object.values(groups).map((errors) => ({
    type: errors[0].type,
    count: errors.length,
  }));
}

export function getErrorGroupLabel(
  type: ReplaceSourceErrorType,
  count: number,
): string {
  switch (type) {
    case "missing-column":
      return count === 1 ? t`Missing column` : t`Missing columns`;
    case "mismatched-column-type":
      return count === 1
        ? t`Mismatched column type`
        : t`Mismatched column types`;
    case "missing-primary-key":
      return count === 1 ? t`Missing primary key` : t`Missing primary keys`;
    case "extra-primary-key":
      return count === 1 ? t`Extra primary key` : t`Extra primary keys`;
    case "missing-foreign-key":
      return count === 1 ? t`Missing foreign key` : t`Missing foreign keys`;
    case "mismatched-foreign-key":
      return count === 1
        ? t`Mismatched foreign key`
        : t`Mismatched foreign keys`;
  }
}
