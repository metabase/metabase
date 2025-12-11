import { msgid, ngettext, t } from "ttag";

import type { DependencyError, DependencyErrorType } from "metabase-types/api";

import type { DependencyErrorsInfo } from "./types";

export function getErrorTypeLabel(type: DependencyErrorType): string {
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

export function getErrorTypeCountMessage(
  type: DependencyErrorType,
  count: number,
): string {
  switch (type) {
    case "query-error/missing-column":
      return ngettext(
        msgid`${count} missing column`,
        `${count} missing columns`,
        count,
      );
    case "query-error/missing-table-alias":
      return ngettext(
        msgid`${count} missing table alias`,
        `${count} missing table aliases`,
        count,
      );
    case "query-error/duplicate-column":
      return ngettext(
        msgid`${count} duplicate column`,
        `${count} duplicate columns`,
        count,
      );
    case "query-error/syntax-error":
      return ngettext(
        msgid`${count} syntax error`,
        `${count} syntax errors`,
        count,
      );
  }
}

export function getErrorDetail(error: DependencyError): string | undefined {
  if (error.type !== "query-error/syntax-error") {
    return error.name;
  }
}

export function getErrorsInfo(
  errors: DependencyError[],
): DependencyErrorsInfo | undefined {
  if (errors.length === 0) {
    return undefined;
  }

  if (errors.length === 1) {
    const [error] = errors;
    const label = getErrorTypeLabel(error.type);
    const detail = getErrorDetail(error);
    return { label, detail };
  }

  const types = new Set(errors.map((error) => error.type));
  if (types.size === 1) {
    const [type] = types;
    return { label: getErrorTypeCountMessage(type, errors.length) };
  }

  return {
    label: ngettext(
      msgid`${errors.length} error`,
      `${errors.length} errors`,
      errors.length,
    ),
  };
}
