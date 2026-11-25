import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import { DataGrid, useDataGridInstance } from "metabase/data-grid";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import type { DescribeActionFormResponse } from "../../api/types";
import type { TableDataGetColumnSortDirection } from "../use-edit-table-data";
import type { TableRowUpdateHandler } from "../use-table-crud";

import S from "./EditTableDataGrid.module.css";
import {
  EditTableDataGridContextProvider,
  type EditTableDataGridContextValue,
} from "./EditTableDataGridContext";
import {
  ROW_SELECT_COLUMN_ID,
  ROW_SELECT_COLUMN_OPTIONS,
} from "./EditTableDataGridRowSelectColumn";
import { useEditDataGridColumnOptions } from "./use-edit-datagrid-column-options";
import { useTableEditingCell } from "./use-table-editing-cell";

type EditTableDataGridProps = {
  data: DatasetData;
  updateFormDescription?: DescribeActionFormResponse;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  handleRowUpdate: TableRowUpdateHandler;
  onRowExpandClick: (rowIndex: number) => void;
  getColumnSortDirection?: TableDataGetColumnSortDirection;
  onColumnSort?: (field: DatasetColumn) => void;
};

export const EditTableDataGrid = ({
  data,
  updateFormDescription,
  rowSelection,
  onRowSelectionChange,
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

  const columnsOptions = useEditDataGridColumnOptions(cols);

  const columnsByName = useMemo(
    () => new Map(cols.map((column) => [column.name, column])),
    [cols],
  );

  const parametersByName = useMemo(
    () =>
      new Map(
        updateFormDescription?.parameters.map((parameter) => [
          parameter.id,
          parameter,
        ]),
      ),
    [updateFormDescription],
  );

  const sortDirectionsByName = useMemo(
    () =>
      new Map(
        cols.map((column) => [column.name, getColumnSortDirection?.(column)]),
      ),
    [cols, getColumnSortDirection],
  );

  const contextValue = useMemo<EditTableDataGridContextValue>(
    () => ({
      columnsByName,
      parametersByName,
      sortDirectionsByName,
      editingCell,
      getCellState,
      onColumnSort,
      onRowExpandClick,
      onCancelEditing: handleCancelEditing,
      onValueUpdated: handleUpdateEditingCell,
    }),
    [
      columnsByName,
      parametersByName,
      sortDirectionsByName,
      editingCell,
      getCellState,
      onColumnSort,
      onRowExpandClick,
      handleCancelEditing,
      handleUpdateEditingCell,
    ],
  );

  // Column widths are measured from values in a separate React root, so it never renders an editor
  const measurementContextValue = useMemo(
    () => ({ ...contextValue, editingCell: null }),
    [contextValue],
  );
  const measurementRenderWrapper = useCallback(
    (children: React.ReactElement) => (
      <EditTableDataGridContextProvider value={measurementContextValue}>
        {children}
      </EditTableDataGridContextProvider>
    ),
    [measurementContextValue],
  );

  const handleBodyCellClick = useCallback(
    (
      _event: React.MouseEvent<HTMLDivElement>,
      rowIndex: number,
      columnId: string,
    ) => {
      if (
        editingCell?.rowIndex === rowIndex &&
        editingCell?.columnId === columnId
      ) {
        return;
      }

      if (parametersByName.get(columnId)?.readonly) {
        return;
      }

      handleSelectEditingCell(rowIndex, columnId);
    },
    [handleSelectEditingCell, editingCell, parametersByName],
  );

  const columnSizingMap = useMemo(() => {
    return {
      [ROW_SELECT_COLUMN_ID]: 74,
    };
  }, []);

  const columnOrder = useMemo(
    () => [ROW_SELECT_COLUMN_ID, ...cols.map(({ name }) => name)],
    [cols],
  );

  const tableProps = useDataGridInstance({
    data: rows,
    columnsOptions,
    columnOrder,
    columnSizingMap,
    enableRowSelection: true,
    rowSelection,
    onRowSelectionChange,
    columnRowSelectOptions: ROW_SELECT_COLUMN_OPTIONS,
    measurementRenderWrapper,
  });

  const stylingProps = useMemo(
    () => ({
      classNames: {
        headerContainer: S.tableHeaderContainer,
        headerCell: S.tableHeaderCell,
        bodyContainer: S.tableBodyContainer,
        bodyCell: S.tableBodyCell,
        row: S.tableRow,
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
    <EditTableDataGridContextProvider value={contextValue}>
      <DataGrid
        onBodyCellClick={handleBodyCellClick}
        {...tableProps}
        {...stylingProps}
      />
    </EditTableDataGridContextProvider>
  );
};
