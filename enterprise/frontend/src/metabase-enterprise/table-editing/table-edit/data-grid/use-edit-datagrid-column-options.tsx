import { useMemo, useState } from "react";
import _ from "underscore";

import type { ColumnOptions } from "metabase/data-grid";
import { formatValue } from "metabase/value-formatting";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import { EditTableDataGridBodyCell } from "./EditTableDataGridBodyCell";
import { EditTableDataGridHeaderCell } from "./EditTableDataGridHeaderCell";

/** Column options that change only when the columns do, so the grid re-renders its cells on data changes instead of remounting them. */
export function useEditDataGridColumnOptions(cols: DatasetColumn[]) {
  const [stableCols, setStableCols] = useState(cols);
  if (cols !== stableCols && !_.isEqual(cols, stableCols)) {
    setStableCols(cols);
  }

  return useMemo<ColumnOptions<RowValues, RowValue>[]>(
    () =>
      stableCols.map((column, columnIndex) => ({
        id: column.name,
        name: column.display_name,
        accessorFn: (row) => row[columnIndex],
        formatter: (value) => formatValue(value, { column }),
        wrap: false,
        header: EditTableDataGridHeaderCell,
        cell: EditTableDataGridBodyCell,
      })),
    [stableCols],
  );
}
