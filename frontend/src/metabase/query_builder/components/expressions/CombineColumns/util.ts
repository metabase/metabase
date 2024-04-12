import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

export type ColumnAndSeparator = {
  separator: string;
  column: Lib.ColumnMetadata | null;
};

export function label(index: number) {
  const ordinal = index + 1;
  if (ordinal === 1) {
    return t`First column`;
  }
  if (ordinal === 2) {
    return t`Second column`;
  }
  if (ordinal === 3) {
    return t`Third column`;
  }
  if (ordinal === 4) {
    return t`Fourth column`;
  }
  if (ordinal === 5) {
    return t`Fifth column`;
  }
  if (ordinal === 6) {
    return t`Sixth column`;
  }
  if (ordinal === 7) {
    return t`Seventh column`;
  }
  if (ordinal === 8) {
    return t`Eighth column`;
  }
  if (ordinal === 9) {
    return t`Ninth column`;
  }

  return t`Column ${ordinal}`;
}

export type ColumnOption = {
  label: string;
  value: string;
  column: Lib.ColumnMetadata;
};

export const getColumnOptions = (
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
) => {
  return columns.map((column, index) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    const label = info.displayName;
    const value = String(index);
    return { column, label, value };
  });
};

export const fromSelectValue = (
  options: ColumnOption[],
  value: string | null,
): Lib.ColumnMetadata | null => {
  if (isNotNull(value)) {
    const index = Number(value);
    return options[index].column;
  }
  return null;
};

export const toSelectValue = (
  options: ColumnOption[],
  column: Lib.ColumnMetadata | null,
): string | undefined => {
  if (!column) {
    return undefined;
  }
  const index = options.findIndex(option => option.column === column);
  return String(index);
};

export const formatSeparator = (separator: string) => {
  if (!separator) {
    return `(${t`empty`})`;
  }

  if (separator === " ") {
    return `(${t`space`})`;
  }

  return separator;
};

export const getDefaultSeparator = (column: Lib.ColumnMetadata): string => {
  if (Lib.isURL(column)) {
    return "/";
  }

  if (Lib.isEmail(column)) {
    return "";
  }

  return " ";
};

export const getExpressionName = (
  query: Lib.Query,
  stageIndex: number,
  columnsAndSeparators: ColumnAndSeparator[],
): string => {
  const columns = columnsAndSeparators
    .map(({ column }) => column)
    .filter(isNotNull);

  const names = columns.map(
    column => Lib.displayInfo(query, stageIndex, column).displayName,
  );
  return t`Combined ${names.join(", ")}`;
};
