import type { Row, Table } from "@tanstack/react-table";
import { useMemo } from "react";

import type { ColumnOptions } from "metabase/data-grid";
import { Checkbox, Flex, rem } from "metabase/ui";
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
      <Flex
        p=".5rem"
        h="100%"
        align="center"
        justify="center"
        bg="var(--cell-bg-color)"
      >
        <Checkbox
          size={rem(16)}
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          data-testid="row-select-all-checkbox"
          styles={{
            input: {
              borderColor: "var(--mb-color-border)",
            },
          }}
        />
      </Flex>
    ),
    cell: ({ row }: { row: Row<RowValues> }) => (
      <Flex p=".5rem" h="100%" align="center" justify="center">
        <Checkbox
          size={rem(16)}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          indeterminate={row.getIsSomeSelected()}
          onChange={row.getToggleSelectedHandler()}
          data-testid="row-select-checkbox"
          styles={{
            input: {
              borderColor: "var(--mb-color-border)",
            },
          }}
        />
      </Flex>
    ),
  };
}
