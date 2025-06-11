import { t } from "ttag";

import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Filter,
  OrderBy,
  RowValue,
  RowValues,
} from "metabase-types/api";

import type {
  CellUniqKey,
  RowCellsWithPkValue,
  RowPkValuesKey,
} from "../types";

export const serializeMbqlParam = (filterMbql: Array<any>): string => {
  return utf8_to_b64url(JSON.stringify(filterMbql));
};

export const deserializeTableFilter = (filterParam: string): Filter | null => {
  const maybeFilter = JSON.parse(b64hash_to_utf8(filterParam));

  // simple and hacky way to test if param is a valid filter
  return Array.isArray(maybeFilter) && typeof maybeFilter[0] === "string"
    ? (maybeFilter as Filter)
    : null;
};

export const deserializeTableSorting = (
  sortingParam: string,
): Array<OrderBy> | null => {
  const maybeParam = JSON.parse(b64hash_to_utf8(sortingParam));

  // simple and hacky way to test if param is valid
  return Array.isArray(maybeParam) &&
    Array.isArray(maybeParam[0]) &&
    typeof maybeParam[0][0] === "string"
    ? (maybeParam as Array<OrderBy>)
    : null;
};

export const getUpdateApiErrorMessage = (
  error: GenericErrorResponse | unknown,
): string => {
  const maybeError = error as GenericErrorResponse;

  if (typeof maybeError.data === "string") {
    return maybeError.data;
  }

  if (
    Array.isArray(maybeError.data?.errors) &&
    "error" in maybeError.data?.errors[0]
  ) {
    return maybeError.data.errors[0].error;
  }

  if (Array.isArray(maybeError.errors) && "error" in maybeError.errors[0]) {
    return maybeError.errors[0].error;
  }

  return t`Unknown error`;
};

export const getPkColumns = (
  columns: DatasetColumn[],
): { indexes: number[]; names: string[] } => {
  const pkColumnIndexes: number[] = [];
  const pkColumnNames: string[] = [];

  columns.forEach((col, index) => {
    if (isPK(col)) {
      pkColumnIndexes.push(index);
      pkColumnNames.push(col.name);
    }
  });

  return {
    indexes: pkColumnIndexes,
    names: pkColumnNames,
  };
};

const getPkValuesKeyString = (pkValues: RowValue[]) => pkValues.join("-");

export const getRowUniqueKeyByPkIndexes = (
  pkColumnIndexes: number[],
  rowData: RowValues,
): string => {
  const resultValues = pkColumnIndexes.map((pkIndex) => rowData[pkIndex]);

  return getPkValuesKeyString(resultValues);
};

export const getCellUniqKey = (
  rowPkValuesKey: RowPkValuesKey,
  columnName: string,
): CellUniqKey => {
  // DataGrid uses rowIndex + column name key, which is not unique, so we have to use pk value
  return `${rowPkValuesKey}_${columnName}`;
};

export const getRowPkValues = (
  columns: DatasetColumn[],
  rowData: RowValues,
): RowCellsWithPkValue => {
  const { indexes: pkColumnIndexes } = getPkColumns(columns);

  const result: RowCellsWithPkValue = {};

  pkColumnIndexes.forEach((pkColumnIndex) => {
    const pkColumn = columns[pkColumnIndex];
    result[pkColumn.name] = rowData[pkColumnIndex];
  });

  return result;
};

export const getRowObjectPkUniqueKeyByColumnNames = (
  pkColumnNames: string[],
  rowObject: RowCellsWithPkValue,
): string => {
  const pkValues: RowValue[] = pkColumnNames.map(
    (colName) => rowObject[colName],
  );

  return getPkValuesKeyString(pkValues);
};
