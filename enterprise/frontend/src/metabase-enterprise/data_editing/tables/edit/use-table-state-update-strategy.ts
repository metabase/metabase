import type { Patch } from "immer";

import type { DatasetColumn, RowValue } from "metabase-types/api";

type DataEditingRow = Record<string, RowValue>;

type PatchCollection = {
  /**
   * An `immer` Patch describing the cache update.
   */
  patches: Patch[];
  /**
   * An `immer` Patch to revert the cache update.
   */
  inversePatches: Patch[];
  /**
   * A function that will undo the cache update.
   */
  undo: () => void;
};

export interface TableEditingStateUpdateStrategy {
  onRowsCreated: (rows?: DataEditingRow[]) => void;
  onRowsUpdated: (rows?: DataEditingRow[]) => PatchCollection | undefined;
  onRowsDeleted: (rows?: DataEditingRow[]) => void;
}

export function mapDataEditingRowObjectsToRowValues(
  rows: Record<string, RowValue>[],
  columns: DatasetColumn[],
) {
  return rows.map((row) => columns.map((column) => row[column.name]));
}

export function createPrimaryKeyToUpdatedRowObjectMap(
  pkColumnName: string,
  rows: Record<string, RowValue>[],
) {
  return new Map(rows.map((row) => [row[pkColumnName], row]));
}
