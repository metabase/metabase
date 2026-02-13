import { msgid, ngettext, t } from "ttag";

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

export function getErrorGroupDescription(
  errorType: ReplaceSourceErrorType,
): string {
  switch (errorType) {
    case "missing-column":
      return t`The new data source is missing some columns that exist in the original. The columns listed below need to be present in the new data source before you can replace it.`;
    case "column-type-mismatch":
      return t`Some columns in the new data source have a different type than in the original. The columns listed below have mismatched types.`;
    case "missing-primary-key":
      return t`Some columns that are primary keys in the original data source are not primary keys in the new one. The columns listed below need to be primary keys in the new data source.`;
    case "extra-primary-key":
      return t`Some columns in the new data source are primary keys, but they aren't in the original. The columns listed below should not be primary keys in the new data source.`;
    case "missing-foreign-key":
      return t`Some columns that are foreign keys in the original data source are not foreign keys in the new one. The columns listed below need to be foreign keys in the new data source.`;
    case "foreign-key-mismatch":
      return t`Some foreign key columns in the new data source point to different targets than in the original. The columns listed below have mismatched foreign key targets.`;
  }
}
