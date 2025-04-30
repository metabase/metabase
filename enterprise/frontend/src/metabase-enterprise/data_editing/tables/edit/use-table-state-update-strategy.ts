import type { DatasetColumn, RowValue } from "metabase-types/api";

type DataEditingRow = Record<string, RowValue>;

export type UndoObject = {
  undo: () => void;
};

export interface TableEditingStateUpdateStrategy {
  onRowsCreated: (rows: DataEditingRow[]) => void;
  onRowsUpdated: (rows: DataEditingRow[]) => UndoObject | void;
  onRowsDeleted: (rows: DataEditingRow[]) => void;
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
