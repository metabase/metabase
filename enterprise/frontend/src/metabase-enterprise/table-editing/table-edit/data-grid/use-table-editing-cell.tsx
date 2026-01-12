import { useCallback, useState } from "react";

import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RowValue } from "metabase-types/api";

import type { RowCellsWithPkValue } from "../../api/types";
import type { TableRowUpdateHandler } from "../use-table-crud";

import {
  EditDataGridCellState,
  useEditDataGridCellState,
} from "./use-edit-datagrid-cell-state";

type UseTableEditingCellProps = {
  data: DatasetData;
  handleRowUpdate: TableRowUpdateHandler;
};

export type TableEditingCell = {
  rowIndex: number;
  columnId: string;
  value: RowValue;
  actionInput: RowCellsWithPkValue;
};

export function useTableEditingCell({
  data,
  handleRowUpdate,
}: UseTableEditingCellProps) {
  const { getCellState, setCellState, resetCellState } =
    useEditDataGridCellState();
  const [editingCell, setEditingCell] = useState<TableEditingCell | null>(null);

  const handleSelectEditingCell = useCallback(
    (rowIndex: number, columnId: string) => {
      if (!data) {
        return;
      }

      const { rows, cols } = data;
      const row = rows[rowIndex];

      const actionInput = cols.reduce((acc, col, index) => {
        if (isPK(col)) {
          acc[col.name] = rows[rowIndex][index];
        }

        return acc;
      }, {} as RowCellsWithPkValue);

      const columnIndex = cols.findIndex((col) => col.name === columnId);
      const value = row[columnIndex];

      setEditingCell({ rowIndex, columnId, value, actionInput });
    },
    [data],
  );

  const handleCancelEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleUpdateEditingCell = useCallback(
    async (value: string | null) => {
      if (!editingCell) {
        return;
      }

      handleCancelEditing();

      if (editingCell.value?.toString() !== value?.toString()) {
        setCellState(
          editingCell.columnId,
          editingCell.rowIndex,
          EditDataGridCellState.Updating,
        );

        const result = await handleRowUpdate({
          input: editingCell.actionInput,
          params: { [editingCell.columnId]: value },
          shouldPerformOptimisticUpdate: true,
        });

        if (!result) {
          setCellState(
            editingCell.columnId,
            editingCell.rowIndex,
            EditDataGridCellState.Error,
          );
        } else {
          resetCellState(editingCell.columnId, editingCell.rowIndex);
        }
      }
    },
    [
      editingCell,
      handleCancelEditing,
      handleRowUpdate,
      resetCellState,
      setCellState,
    ],
  );

  return {
    editingCell,
    getCellState,
    handleSelectEditingCell,
    handleUpdateEditingCell,
    handleCancelEditing,
  };
}
