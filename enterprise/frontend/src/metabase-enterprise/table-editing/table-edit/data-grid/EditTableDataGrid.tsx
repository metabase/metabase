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
import { useEditDataGridColumnOptions } from "./use-edit-datagrid-column-options";
import {
  ROW_SELECT_COLUMN_ID,
  useTableColumnRowSelect,
} from "./use-table-column-row-select";
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

  const sortDirectionsByName = useMemo(
    () =>
      new Map(
        cols.map((column) => [column.name, getColumnSortDirection?.(column)]),
      ),
    [cols, getColumnSortDirection],
  );

  const contextValue = useMemo<EditTableDataGridContextValue>(
    () => ({
      columnsByName: new Map(cols.map((column) => [column.name, column])),
      parametersByName: new Map(
        updateFormDescription?.parameters.map((parameter) => [
          parameter.id,
          parameter,
        ]),
      ),
      sortDirectionsByName,
      editingCell,
      getCellState,
      onColumnSort,
      onCancelEditing: handleCancelEditing,
      onValueUpdated: handleUpdateEditingCell,
    }),
    [
      cols,
      updateFormDescription,
      sortDirectionsByName,
      editingCell,
      getCellState,
      onColumnSort,
      handleCancelEditing,
      handleUpdateEditingCell,
    ],
  );

  // Column widths are measured in a separate React root
  const measurementRenderWrapper = useCallback(
    (children: React.ReactElement) => (
      <EditTableDataGridContextProvider value={contextValue}>
        {children}
      </EditTableDataGridContextProvider>
    ),
    [contextValue],
  );

  const columnRowSelectOptions = useTableColumnRowSelect({
    onRowEditClick: onRowExpandClick,
  });

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

      const parameter = updateFormDescription?.parameters.find(
        ({ id }) => id === columnId,
      );
      if (parameter?.readonly) {
        return;
      }

      handleSelectEditingCell(rowIndex, columnId);
    },
    [handleSelectEditingCell, editingCell, updateFormDescription],
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
    columnRowSelectOptions,
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
