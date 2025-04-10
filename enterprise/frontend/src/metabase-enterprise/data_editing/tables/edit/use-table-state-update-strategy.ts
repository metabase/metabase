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
