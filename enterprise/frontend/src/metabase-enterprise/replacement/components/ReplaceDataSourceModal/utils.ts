import { msgid, ngettext } from "ttag";

import type {
  ReplaceSourceEntry,
  ReplaceSourceErrorType,
} from "metabase-types/api";

export function isSameSource(
  source1: ReplaceSourceEntry,
  source2: ReplaceSourceEntry,
): boolean {
  return source1.id === source2.id && source1.type === source2.type;
}

export function getErrorGroupLabel(
  errorType: ReplaceSourceErrorType,
  errorCount: number,
): string {
  switch (errorType) {
    case "missing-column":
      return ngettext(
        msgid`${errorCount} missing column`,
        `${errorCount} missing columns`,
        errorCount,
      );
    case "column-type-mismatch":
      return ngettext(
        msgid`${errorCount} column type mismatch`,
        `${errorCount} column type mismatches`,
        errorCount,
      );
    case "missing-primary-key":
      return ngettext(
        msgid`${errorCount} missing primary key`,
        `${errorCount} missing primary keys`,
        errorCount,
      );
    case "extra-primary-key":
      return ngettext(
        msgid`${errorCount} extra primary key`,
        `${errorCount} extra primary keys`,
        errorCount,
      );
    case "missing-foreign-key":
      return ngettext(
        msgid`${errorCount} missing foreign key`,
        `${errorCount} missing foreign keys`,
        errorCount,
      );
    case "foreign-key-mismatch":
      return ngettext(
        msgid`${errorCount} foreign key mismatch`,
        `${errorCount} foreign key mismatches`,
        errorCount,
      );
  }
}
