import { msgid, ngettext } from "ttag";

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
    const group = groups[error.type] ?? [];
    group.push(error);
    groups[error.type] = group;
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
      return ngettext(
        msgid`${count} missing column`,
        `${count} missing columns`,
        count,
      );
    case "column-type-mismatch":
      return ngettext(
        msgid`${count} column type mismatch`,
        `${count} column type mismatches`,
        count,
      );
    case "missing-primary-key":
      return ngettext(
        msgid`${count} missing primary key`,
        `${count} missing primary keys`,
        count,
      );
    case "extra-primary-key":
      return ngettext(
        msgid`${count} extra primary key`,
        `${count} extra primary keys`,
        count,
      );
    case "missing-foreign-key":
      return ngettext(
        msgid`${count} missing foreign key`,
        `${count} missing foreign keys`,
        count,
      );
    case "foreign-key-mismatch":
      return ngettext(
        msgid`${count} foreign key mismatch`,
        `${count} foreign key mismatches`,
        count,
      );
  }
}
