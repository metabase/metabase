import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { Dataset, RowValues } from "metabase-types/api";

import type { ColumnAndSeparator } from "./types";

export const getNextColumnAndSeparator = (
  expressionableColumns: Lib.ColumnMetadata[],
  defaultSeparator: string,
  columnsAndSeparators: ColumnAndSeparator[],
): ColumnAndSeparator => {
  const lastSeparator = columnsAndSeparators.at(-1)?.separator;
  const separator = lastSeparator ?? defaultSeparator;

  const nextUnusedColumn = expressionableColumns.find(candidate =>
    columnsAndSeparators.every(({ column }) => candidate !== column),
  );

  const result = nextUnusedColumn ?? expressionableColumns[0];
  return { column: result, separator };
};

export const formatSeparator = (separator: string): string => {
  if (separator.length === 0) {
    return `(${t`empty`})`;
  }

  if (separator === " ") {
    return `(${t`space`})`;
  }

  return separator;
};

export const extractQueryResults = (
  query: Lib.Query,
  stageIndex: number,
  datasets: Dataset[] | null,
): {
  columns: Lib.ColumnMetadata[];
  rows: RowValues[];
} => {
  if (!datasets || datasets.length === 0) {
    return { columns: [], rows: [] };
  }

  const data = datasets[0].data;
  const rows = data.rows;

  const columns = data.results_metadata.columns.map(column => {
    return Lib.fromLegacyColumn(query, stageIndex, column);
  });

  return { rows, columns };
};

export const getExample = (
  column: Lib.ColumnMetadata,
  columnsAndSeparators: ColumnAndSeparator[],
): string => {
  return [
    getColumnExample(column),
    ...columnsAndSeparators.flatMap(({ column, separator }) => [
      separator,
      getColumnExample(column),
    ]),
  ].join("");
};

const getColumnExample = (column: Lib.ColumnMetadata): string => {
  if (Lib.isURL(column)) {
    return "https://www.example.com";
  }

  if (Lib.isEmail(column)) {
    return "email@example.com";
  }

  if (Lib.isID(column)) {
    return "12345";
  }

  if (Lib.isBoolean(column)) {
    return "true";
  }

  if (Lib.isNumeric(column)) {
    return "123.45678901234567";
  }

  if (Lib.isDateWithoutTime(column)) {
    return "2042-01-01";
  }

  if (Lib.isTemporal(column)) {
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

export const getDefaultSeparator = (column: Lib.ColumnMetadata): string => {
  if (Lib.isURL(column)) {
    return "/";
  }

  if (Lib.isEmail(column)) {
    return "";
  }

  return " ";
};

export const getDrillExpressionClause = (
  column: Lib.ColumnMetadata,
  columnsAndSeparators: ColumnAndSeparator[],
) => {
  return Lib.expressionClause("concat", [
    column,
    ...columnsAndSeparators.flatMap(({ column, separator }) => [
      separator,
      column,
    ]),
  ]);
};

export const getExpressionName = (
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  columnsAndSeparators: ColumnAndSeparator[],
): string => {
  const columnNames = Lib.returnedColumns(query, stageIndex).map(
    column => Lib.displayInfo(query, stageIndex, column).displayName,
  );

  const name = getCombinedColumnName(
    query,
    stageIndex,
    column,
    columnsAndSeparators,
  );

  return getNextName(columnNames, name, 1);
};

function getNextName(names: string[], name: string, index: number): string {
  const suffixed = index === 1 ? name : `${name}_${index}`;
  if (!names.includes(suffixed)) {
    return suffixed;
  }
  return getNextName(names, name, index + 1);
}

function getCombinedColumnName(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  columnsAndSeparators: ColumnAndSeparator[],
) {
  const columns = [column, ...columnsAndSeparators.map(({ column }) => column)];
  const names = columns.map(
    column => Lib.displayInfo(query, stageIndex, column).displayName,
  );
  return names.join(" ");
}
