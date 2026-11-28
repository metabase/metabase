import type { CellContext, HeaderContext } from "@tanstack/react-table";
import { t } from "ttag";

import { BaseCell } from "metabase/data-grid";
import { Checkbox, Flex, Group, Icon, Tooltip } from "metabase/ui";
import type { RowValue, RowValues } from "metabase-types/api";

import S from "./EditTableDataGrid.module.css";
import { useEditTableDataGridContext } from "./EditTableDataGridContext";
import CellS from "./TableEditingCell.module.css";

export const ROW_SELECT_COLUMN_ID = "__MB_ROW_SELECT";

type RowSelectHeaderProps = HeaderContext<RowValues, RowValue>;

function RowSelectHeader({ table }: RowSelectHeaderProps) {
  return (
    <Flex p="0.75rem" h="100%" align="center" className={S.tableHeaderCell}>
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        indeterminate={table.getIsSomeRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
        data-testid="row-select-all-checkbox"
        classNames={{ input: S.checkboxInput }}
      />
    </Flex>
  );
}

type RowSelectCellProps = CellContext<RowValues, RowValue>;

function RowSelectCell({ row, table }: RowSelectCellProps) {
  const { onRowExpandClick } = useEditTableDataGridContext();

  return (
    <BaseCell className={CellS.cell}>
      <Group align="center" justify="flex-start" h="100%">
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          data-testid="row-select-checkbox"
          classNames={{ input: S.checkboxInput }}
        />

        {/* Only show the edit icon when no rows are selected */}
        {!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected() && (
          <Tooltip label={t`Edit record`}>
            <Icon
              name="pencil"
              data-testid="row-edit-icon"
              className={S.pencilIcon}
              onClick={() => onRowExpandClick(row.index)}
            />
          </Tooltip>
        )}
      </Group>
    </BaseCell>
  );
}

export const ROW_SELECT_COLUMN_OPTIONS = {
  id: ROW_SELECT_COLUMN_ID,
  name: "",
  accessorFn: () => null,
  meta: { isUtilityColumn: true },
  header: RowSelectHeader,
  cell: RowSelectCell,
};
