import cx from "classnames";
import { useCallback, useMemo } from "react";

import type { ColumnOptions } from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting";
import type { DescribeActionFormResponse } from "metabase-enterprise/table-editing/api/types";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import type { TableDataGetColumnSortDirection } from "../use-edit-table-data";

import S from "./TableEditingCell.module.css";
import { getEditingCellTemplate } from "./getEditingCellTemplate";
import { getTableEditingHeaderTemplate } from "./getHeaderTemplate";
import { EditDataGridCellState } from "./use-edit-datagrid-cell-state";
import type { TableEditingCell } from "./use-table-editing-cell";

type UseEditDataGridColumnOptions = {
  cols: DatasetColumn[];
  editingCell: TableEditingCell | null;
  updateFormDescription?: DescribeActionFormResponse;
  getColumnSortDirection?: TableDataGetColumnSortDirection;
  onColumnSort?: (column: DatasetColumn) => void;
  onCancelEditing: () => void;
  onValueUpdated: (value: string | null) => void;
  getCellState: (
    columnId: string,
    rowIndex: number,
  ) => EditDataGridCellState | undefined;
};

export function useEditDataDridColumnOptions({
  cols,
  editingCell,
  updateFormDescription,
  getColumnSortDirection,
  onColumnSort,
  onCancelEditing,
  onValueUpdated,
  getCellState,
}: UseEditDataGridColumnOptions) {
  const getIsEditing = useCallback(
    (columnId: string, rowIndex: number) => {
      return (
        editingCell?.columnId === columnId && editingCell?.rowIndex === rowIndex
      );
    },
    [editingCell],
  );

  const getCellClassName = useCallback(
    (_value: RowValue, rowIndex: number, columnId: string) => {
      const cellState = getCellState(columnId, rowIndex);
      return cx(S.cell, {
        [S.updatingCell]: cellState === EditDataGridCellState.Updating,
        [S.errorCell]: cellState === EditDataGridCellState.Error,
      });
    },
    [getCellState],
  );

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
          getCellClassName,
          header: getTableEditingHeaderTemplate({
            column,
            onColumnSort,
            sortDirection,
          }),
        };

        const parameterDescription = updateFormDescription?.parameters.find(
          (parameter) => parameter.id === column.name,
        );

        if (parameterDescription) {
          options.getIsEditing = getIsEditing;
          options.editingCell = getEditingCellTemplate({
            parameterDescription,
            onCancelEditing,
            onValueUpdated,
          });

          if (parameterDescription.readonly) {
            options.getCellClassName = () => S.readonlyCell;
          }
        }

        return options;
      }),
    [
      cols,
      getColumnSortDirection,
      onColumnSort,
      getIsEditing,
      getCellClassName,
      onCancelEditing,
      onValueUpdated,
      updateFormDescription,
    ],
  );
}
