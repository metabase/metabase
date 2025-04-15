import type { DatasetColumn, RowValue } from "metabase-types/api";

type DataEditingRow = Record<string, RowValue>;

export interface TableEditingStateUpdateStrategy {
  onRowsCreated: (rows?: DataEditingRow[]) => void;
  onRowsUpdated: (rows?: DataEditingRow[]) => void;
  onRowsDeleted: (rows?: DataEditingRow[]) => void;
}

export function mapDataEditingRowObjectsToRowValues(
  rows: Record<string, RowValue>[],
  columns: DatasetColumn[],
) {
  return rows.map((row) => columns.map((column) => row[column.name]));
}

// For undo/redo operations, the updated changeset may be partial
// so we need to mark the missing columns with a special value
export const MISSING_COLUMN_MARK = Symbol(
  "state-update-strategy-missing-column",
);

export function mapDataEditingRowObjectsToPartialRowValues(
  rows: Record<string, RowValue>[],
  columns: DatasetColumn[],
) {
  return rows.map((row) =>
    columns.map((column) =>
      column.name in row ? row[column.name] : MISSING_COLUMN_MARK,
    ),
  );
}
