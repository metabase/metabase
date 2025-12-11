import { msgid, ngettext, t } from "ttag";

import type { DependencyError, DependencyErrorType } from "metabase-types/api";

export function getErrorLabel(type: DependencyErrorType): string {
  switch (type) {
    case "query-error/missing-column":
      return t`Missing column`;
    case "query-error/missing-table-alias":
      return t`Missing table alias`;
    case "query-error/duplicate-column":
      return t`Duplicate column`;
    case "query-error/syntax-error":
      return t`Syntax error`;
  }
}

export function getErrorMessage(error: DependencyError): string | null {
  if (error.type !== "query-error/syntax-error") {
    return error.name;
  }
  return null;
}

export function getErrorCountMessage(errors: DependencyError[]): string {
  return ngettext(
    msgid`${errors.length} error`,
    `${errors.length} errors`,
    errors.length,
  );
}
