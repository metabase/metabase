import type { DatasetColumn } from "metabase-types/api";

import type { RowCellsWithPkValue } from "../api/types";
import { getRowObjectPkUniqueKeyByColumnNames } from "../common/utils";

export type OptimisticUpdatePatchResult = {
  revert: () => void;
};

export interface TableEditingStateUpdateStrategy {
  onRowsCreated: (rows: RowCellsWithPkValue[]) => void;
  onRowsUpdated: (
    rows: RowCellsWithPkValue[],
  ) => OptimisticUpdatePatchResult | void;
  onRowsDeleted: (rows: RowCellsWithPkValue[]) => void;
}

export function mapDataEditingRowObjectsToRowValues(
  rows: RowCellsWithPkValue[],
  columns: DatasetColumn[],
) {
  return rows.map((row) => columns.map((column) => row[column.name]));
}

export function createPrimaryKeyToUpdatedRowObjectMap(
  pkColumnNames: string[],
  rows: RowCellsWithPkValue[],
) {
  return new Map(
    rows.map((row) => {
      const pkUniqueKey = getRowObjectPkUniqueKeyByColumnNames(
        pkColumnNames,
        row,
      );
      return [pkUniqueKey, row];
    }),
  );
}
