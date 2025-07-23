import { useCallback, useMemo } from "react";

import {
  DataGrid,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";
import { ROW_ID_COLUMN_ID } from "metabase/data-grid/constants";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import type { DescribeActionFormResponse } from "../../api/types";
import type { TableDataGetColumnSortDirection } from "../use-edit-table-data";
import type { TableRowUpdateHandler } from "../use-table-crud";

import S from "./EditTableDataGrid.module.css";
import { useEditDataDridColumnOptions } from "./use-edit-datagrid-column-options";
import { useTableEditingCell } from "./use-table-editing-cell";

type EditTableDataGridProps = {
  data: DatasetData;
  updateFormDescription?: DescribeActionFormResponse;
  handleRowUpdate: TableRowUpdateHandler;
  onRowExpandClick: (rowIndex: number) => void;
  getColumnSortDirection?: TableDataGetColumnSortDirection;
  onColumnSort?: (field: DatasetColumn) => void;
};

export const EditTableDataGrid = ({
  data,
  updateFormDescription,
  onRowExpandClick,
  getColumnSortDirection,
  onColumnSort,
  handleRowUpdate,
}: EditTableDataGridProps) => {
  const { cols, rows } = data;

  const {
    editingCell,
    getCellState,
    handleSelectEditingCell,
    handleCancelEditing,
    handleUpdateEditingCell,
  } = useTableEditingCell({
    data,
    handleRowUpdate,
  });

  const columnsOptions = useEditDataDridColumnOptions({
    cols,
    editingCell,
    updateFormDescription,
    getColumnSortDirection,
    onColumnSort,
    onCancelEditing: handleCancelEditing,
    onValueUpdated: handleUpdateEditingCell,
    getCellState,
  });

  const rowIdColumnOptions: RowIdColumnOptions = useMemo(
    () => ({
      variant: "expandButton",
    }),
    [],
  );

  const handleBodyCellClick = useCallback(
    (
      _event: React.MouseEvent<HTMLDivElement>,
      rowIndex: number,
      columnId: string,
    ) => {
      if (columnId === ROW_ID_COLUMN_ID) {
        onRowExpandClick(rowIndex);
        return;
      }

      if (
        editingCell?.rowIndex === rowIndex &&
        editingCell?.columnId === columnId
      ) {
        return;
      }

      handleSelectEditingCell(rowIndex, columnId);
    },
    [onRowExpandClick, handleSelectEditingCell, editingCell],
  );

  const columnOrder = useMemo(() => cols.map(({ name }) => name), [cols]);

  const tableProps = useDataGridInstance({
    data: rows,
    rowId: rowIdColumnOptions,
    columnsOptions,
    columnOrder,
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
      styles: {
        bodyCell: {
          backgroundColor: undefined,
        },
      },
      theme: {
        cell: {
          backgroundColor: "",
        },
      },
    }),
    [],
  );

  return (
    <DataGrid
      onBodyCellClick={handleBodyCellClick}
      {...tableProps}
      {...stylingProps}
    />
  );
};
