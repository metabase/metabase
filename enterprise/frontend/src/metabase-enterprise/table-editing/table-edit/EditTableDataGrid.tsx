import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import { useMemo } from "react";

import {
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { ROW_ID_COLUMN_ID } from "metabase/data-grid/constants";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import S from "./EditTableDataGrid.module.css";
import { useEditDataDridColumnOptions } from "./use-edit-datagrid-column-options";
import type { TableDataGetColumnSortDirection } from "./use-edit-table-data";
import {
  ROW_SELECT_COLUMN_ID,
  useTableColumnRowSelect,
} from "./use-table-column-row-select";

type EditTableDataGridProps = {
  data: DatasetData;
  onRowExpandClick: (rowIndex: number) => void;
  hasRowSelection: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getColumnSortDirection?: TableDataGetColumnSortDirection;
  onColumnSort?: (field: DatasetColumn) => void;
};

export const EditTableDataGrid = ({
  data,
  onRowExpandClick,
  hasRowSelection,
  rowSelection,
  onRowSelectionChange,
  getColumnSortDirection,
  onColumnSort,
}: EditTableDataGridProps) => {
  const { cols, rows } = data;

  const columnRowSelectOptions = useTableColumnRowSelect(hasRowSelection);
  const columnsOptions = useEditDataDridColumnOptions({
    cols,
    getColumnSortDirection,
    onColumnSort,
  });

  const rowIdColumnOptions: RowIdColumnOptions = useMemo(
    () => ({
      variant: "expandButton",
      onRowExpandClick,
    }),
    [onRowExpandClick],
  );

  const columnPinning = useMemo(() => {
    return {
      left: hasRowSelection
        ? [ROW_SELECT_COLUMN_ID, ROW_ID_COLUMN_ID]
        : [ROW_ID_COLUMN_ID],
    };
  }, [hasRowSelection]);

  const tableProps = useDataGridInstance({
    data: rows,
    rowId: rowIdColumnOptions,
    columnsOptions,
    columnPinning,
    enableRowSelection: hasRowSelection,
    rowSelection,
    onRowSelectionChange,
    columnRowSelectOptions: columnRowSelectOptions,
  });

  const stylingProps = useMemo(
    () => ({
      classNames: {
        headerContainer: S.tableHeaderContainer,
        headerCell: S.tableHeaderCell,
        bodyContainer: S.tableBodyContainer,
        bodyCell: S.tableBodyCell,
        row: S.tableRow,
        root: S.tableRoot,
      },

      // Overrides theme constants and default bg
      bodyCell: {
        backgroundColor: undefined,
      },
      cell: {
        backgroundColor: "",
      },
    }),
    [],
  );

  return <DataGrid {...tableProps} {...stylingProps} />;
};
