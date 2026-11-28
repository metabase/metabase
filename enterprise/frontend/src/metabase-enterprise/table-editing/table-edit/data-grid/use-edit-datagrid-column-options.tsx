import { useMemo, useState } from "react";

import type { ColumnOptions } from "metabase/data-grid";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import { EditTableDataGridBodyCell } from "./EditTableDataGridBodyCell";
import { EditTableDataGridHeaderCell } from "./EditTableDataGridHeaderCell";

/** Column options that change only when a column is added, removed, moved or renamed, so the grid re-renders its cells on data changes instead of remounting them. */
export function useEditDataGridColumnOptions(cols: DatasetColumn[]) {
  const [layoutCols, setLayoutCols] = useState(cols);
  const hasNewColumnLayout =
    cols.length !== layoutCols.length ||
    cols.some(
      (column, index) =>
        column.name !== layoutCols[index].name ||
        column.display_name !== layoutCols[index].display_name,
    );
  if (hasNewColumnLayout) {
    setLayoutCols(cols);
  }

  return useMemo<ColumnOptions<RowValues, RowValue>[]>(
    () =>
      layoutCols.map((column, columnIndex) => ({
        id: column.name,
        name: column.display_name,
        accessorFn: (row) => row[columnIndex],
        wrap: false,
        header: EditTableDataGridHeaderCell,
        cell: EditTableDataGridBodyCell,
      })),
    [layoutCols],
  );
}
