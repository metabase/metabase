import { t } from "ttag";

import { b64hash_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, Filter } from "metabase-types/api";

import type { CellUniqKey, RowPkValue } from "../types";

export const serializeTableFilter = (filterMbql: Filter): string => {
  return utf8_to_b64url(JSON.stringify(filterMbql));
};

export const deserializeTableFilter = (filterParam: string): Filter | null => {
  const maybeFilter = JSON.parse(b64hash_to_utf8(filterParam));

  // simple and hacky way to test if param is a valid filter
  return Array.isArray(maybeFilter) && typeof maybeFilter[0] === "string"
    ? (maybeFilter as Filter)
    : null;
};

export const getRowPkKeyValue = (
  datasetData: DatasetData,
  rowIndex: number,
) => {
  const columns = datasetData.cols;
  const rowData = datasetData.rows[rowIndex];

  const pkColumnIndex = columns.findIndex(isPK);
  const pkColumn = columns[pkColumnIndex];
  const rowPkValue = rowData[pkColumnIndex];

  return { [pkColumn.name]: rowPkValue };
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

export const getCellUniqKey = (
  rowPkValue: RowPkValue,
  columnName: string,
): CellUniqKey => {
  // DataGrid uses rowIndex + column name key, which is not unique, so we have to use pk value
  return `${rowPkValue}_${columnName}`;
};
