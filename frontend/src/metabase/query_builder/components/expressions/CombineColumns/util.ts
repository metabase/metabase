import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

export type ColumnAndSeparator = {
  separator: string | null;
  column: Lib.ColumnMetadata | null;
};

export const label = (index: number) => {
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
};

export type ColumnOption = {
  label: string;
  value: string;
  column: Lib.ColumnMetadata;
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

export const getDefaultSeparator = (
  column: Lib.ColumnMetadata | undefined,
): string => {
  if (!column) {
    return " ";
  }
  if (Lib.isEmail(column)) {
    return "";
  }

  if (Lib.isURL(column)) {
    return "/";
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

  const allColumnNames = Lib.returnedColumns(query, stageIndex).map(
    column => Lib.displayInfo(query, stageIndex, column).displayName,
  );

  const names = columns.map(
    column => Lib.displayInfo(query, stageIndex, column).displayName,
  );

  return getNextName(allColumnNames, t`Combined ${names.join(", ")}`, 1);
};

function getNextName(names: string[], name: string, index: number): string {
  const suffixed = index === 1 ? name : `${name}_${index}`;
  if (!names.includes(suffixed)) {
    return suffixed;
  }
  return getNextName(names, name, index + 1);
}

export const flatten = (
  columnsAndSeparators: ColumnAndSeparator[],
): (string | Lib.ColumnMetadata)[] => {
  return columnsAndSeparators
    .flatMap(({ column, separator }) => [separator, column])
    .slice(1)
    .filter(
      (element): element is string | Lib.ColumnMetadata =>
        element !== null && element !== "",
    );
};

export const getExample = (
  columnsAndSeparators: ColumnAndSeparator[],
): string => {
  return flatten(columnsAndSeparators).map(getColumnExample).join("");
};

const getColumnExample = (
  column: Lib.ColumnMetadata | string | null,
): string => {
  if (!column) {
    return "";
  }
  if (typeof column === "string") {
    return column;
  }

  if (Lib.isEmail(column)) {
    return "email@example.com";
  }

  if (Lib.isURL(column)) {
    return "https://www.example.com";
  }

  if (Lib.isBoolean(column)) {
    return "true";
  }

  if (Lib.isID(column)) {
    return "12345";
  }

  if (Lib.isInteger(column)) {
    return "123";
  }

  if (Lib.isNumeric(column)) {
    return "123.45678901234567";
  }

  if (Lib.isDateWithoutTime(column)) {
    return "2042-01-01";
  }

  if (Lib.isDate(column)) {
    return "2042-01-01 12:34:56.789";
  }

  if (Lib.isTime(column)) {
    return "12:34:56.789";
  }

  if (Lib.isLatitude(column) || Lib.isLongitude(column)) {
    return "-12.34567";
  }

  return "text";
};

export function hasCombinations(query: Lib.Query, stageIndex: number) {
  return Lib.expressionableColumns(query, stageIndex).length > 0;
}

export const getNextColumnAndSeparator = (
  expressionableColumns: Lib.ColumnMetadata[],
  defaultSeparator: string,
  columnsAndSeparators: ColumnAndSeparator[],
  autoPickColumns: boolean,
): ColumnAndSeparator => {
  const lastSeparator = columnsAndSeparators.at(-1)?.separator;
  const separator = lastSeparator ?? defaultSeparator;

  if (!autoPickColumns) {
    return {
      column: null,
      separator,
    };
  }

  const nextUnusedColumn = expressionableColumns.find(candidate =>
    columnsAndSeparators.every(({ column }) => candidate !== column),
  );

  const result = nextUnusedColumn ?? expressionableColumns[0];
  return { column: result, separator };
};
