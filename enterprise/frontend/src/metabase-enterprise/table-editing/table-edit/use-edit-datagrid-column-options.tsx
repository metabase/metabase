import { useMemo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { ColumnOptions } from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting";
import { Box, Icon } from "metabase/ui";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import S from "./EditTableDataGrid.module.css";
import type { TableDataGetColumnSortDirection } from "./use-edit-table-data";

type UseEditDataGridColumnOptions = {
  cols: DatasetColumn[];
  getColumnSortDirection?: TableDataGetColumnSortDirection;
  onColumnSort?: (column: DatasetColumn) => void;
};

export function useEditDataDridColumnOptions({
  cols,
  getColumnSortDirection,
  onColumnSort,
}: UseEditDataGridColumnOptions) {
  return useMemo<ColumnOptions<RowValues, RowValue>[]>(
    () =>
      cols.map((column, columnIndex) => {
        const sortDirection = getColumnSortDirection?.(column);
        const options: ColumnOptions<RowValues, RowValue> = {
          id: column.name,
          name: column.display_name,
          accessorFn: (row) => row[columnIndex],
          formatter: (value) => formatValue(value, { column }),
          wrap: false,
          sortDirection,
          header: function EditingHeader() {
            return (
              <Box
                className={S.headerCellContainer}
                onClick={() => {
                  onColumnSort?.(column);
                }}
              >
                <Ellipsified>{column.display_name}</Ellipsified>
                {sortDirection != null ? (
                  <Icon
                    className={S.sortIndicator}
                    data-testid="header-sort-indicator"
                    name={sortDirection === "asc" ? "chevronup" : "chevrondown"}
                    size={10}
                  />
                ) : null}
              </Box>
            );
          },
        };

        return options;
      }),
    [cols, getColumnSortDirection, onColumnSort],
  );
}
