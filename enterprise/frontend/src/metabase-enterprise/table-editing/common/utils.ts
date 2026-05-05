import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import type { RowCellsWithPkValue } from "../api/types";

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

export const getRowObjectPkUniqueKeyByColumnNames = (
  pkColumnNames: string[],
  rowObject: RowCellsWithPkValue,
): string => {
  const pkValues: RowValue[] = pkColumnNames.map(
    (colName) => rowObject[colName],
  );

  return getPkValuesKeyString(pkValues);
};
