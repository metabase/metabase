import type { Row, Table } from "@tanstack/react-table";
import { useMemo } from "react";

import type { ColumnOptions } from "metabase/data-grid";
import { Checkbox, Flex } from "metabase/ui";
import type { RowValue, RowValues } from "metabase-types/api";

export const ROW_SELECT_COLUMN_ID = "__MB_ROW_SELECT";

export function useTableColumnRowSelect(hasRowSelection: boolean) {
  return useMemo<ColumnOptions<RowValues, RowValue> | undefined>(
    () => (hasRowSelection ? getRowSelectColumn() : undefined),
    [hasRowSelection],
  );
}

export function getRowSelectColumn() {
  return {
    id: ROW_SELECT_COLUMN_ID,
    name: "",
    accessorFn: () => null,
    header: ({ table }: { table: Table<RowValues> }) => (
      <Flex px=".5rem" h="100%" align="center" bg="var(--cell-bg-color)">
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          variant="stacked"
        />
      </Flex>
    ),
    cell: ({ row }: { row: Row<RowValues> }) => (
      <Flex p=".5rem" h="100%" align="start">
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          indeterminate={row.getIsSomeSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      </Flex>
    ),
  };
}
