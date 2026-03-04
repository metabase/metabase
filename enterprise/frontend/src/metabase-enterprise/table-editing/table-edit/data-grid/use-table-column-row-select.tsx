import type { Row, Table } from "@tanstack/react-table";
import { useMemo } from "react";

import { BaseCell, type ColumnOptions } from "metabase/data-grid";
import { Checkbox, Flex, Group, Icon, Tooltip, rem } from "metabase/ui";
import type { RowValue, RowValues } from "metabase-types/api";

import S from "./EditTableDataGrid.module.css";
import CellS from "./TableEditingCell.module.css";

export const ROW_SELECT_COLUMN_ID = "__MB_ROW_SELECT";

type UseTableColumnRowSelectProps = {
  onRowEditClick: (rowIndex: number) => void;
};

export function useTableColumnRowSelect({
  onRowEditClick,
}: UseTableColumnRowSelectProps) {
  return useMemo<ColumnOptions<RowValues, RowValue> | undefined>(
    () => getRowSelectColumn({ onRowEditClick }),
    [onRowEditClick],
  );
}

export function getRowSelectColumn({
  onRowEditClick,
}: UseTableColumnRowSelectProps) {
  return {
    id: ROW_SELECT_COLUMN_ID,
    name: "",
    accessorFn: () => null,
    header: ({ table }: { table: Table<RowValues> }) => (
      <Flex p="0.75rem" h="100%" align="center" className={S.tableHeaderCell}>
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
    cell: ({
      row,
      table,
    }: {
      row: Row<RowValues>;
      table: Table<RowValues>;
    }) => (
      <BaseCell className={CellS.cell}>
        <Group align="center" justify="flex-start" h="100%">
          <Checkbox
            size={rem(16)}
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            data-testid="row-select-checkbox"
            styles={{
              input: {
                borderColor: "var(--mb-color-border)",
              },
            }}
          />

          {/* Only show the edit icon when no rows are selected */}
          {!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected() && (
            <Tooltip label="Edit record">
              <Icon
                name="pencil"
                data-testid="row-edit-icon"
                className={S.pencilIcon}
                onClick={() => onRowEditClick(row.index)}
              />
            </Tooltip>
          )}
        </Group>
      </BaseCell>
    ),
  };
}
