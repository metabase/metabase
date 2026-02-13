import { msgid, ngettext } from "ttag";

import type { ReplaceSourceError } from "metabase-types/api";

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
