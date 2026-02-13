import { msgid, ngettext, t } from "ttag";

import type {
  ReplaceSourceEntry,
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

export function isSameSource(
  source1: ReplaceSourceEntry,
  source2: ReplaceSourceEntry,
): boolean {
  return source1.id === source2.id && source1.type === source2.type;
}

export function getErrorGroupLabel(error: ReplaceSourceError): string {
  switch (error.type) {
    case "missing-column":
      return ngettext(
        msgid`${error.columns.length} missing column`,
        `${error.columns.length} missing columns`,
        error.columns.length,
      );
    case "column-type-mismatch":
      return ngettext(
        msgid`${error.columns.length} column type mismatch`,
        `${error.columns.length} column type mismatches`,
        error.columns.length,
      );
    case "missing-primary-key":
      return ngettext(
        msgid`${error.columns.length} missing primary key`,
        `${error.columns.length} missing primary keys`,
        error.columns.length,
      );
    case "extra-primary-key":
      return ngettext(
        msgid`${error.columns.length} extra primary key`,
        `${error.columns.length} extra primary keys`,
        error.columns.length,
      );
    case "missing-foreign-key":
      return ngettext(
        msgid`${error.columns.length} missing foreign key`,
        `${error.columns.length} missing foreign keys`,
        error.columns.length,
      );
    case "foreign-key-mismatch":
      return ngettext(
        msgid`${error.columns.length} foreign key mismatch`,
        `${error.columns.length} foreign key mismatches`,
        error.columns.length,
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
