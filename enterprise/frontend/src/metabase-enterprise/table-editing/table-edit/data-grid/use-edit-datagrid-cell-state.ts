import { useCallback, useState } from "react";

export enum EditDataGridCellState {
  Updating,
  Error,
}

export function useEditDataGridCellState() {
  const [cellState, _setCellState] = useState<
    Record<string, EditDataGridCellState | undefined>
  >({});

  const getCellState = useCallback(
    (columnId: string, rowIndex: number) => {
      return cellState[getCellKey(columnId, rowIndex)];
    },
    [cellState],
  );

  const setCellState = useCallback(
    (columnId: string, rowIndex: number, state: EditDataGridCellState) => {
      _setCellState((prev) => ({
        ...prev,
        [getCellKey(columnId, rowIndex)]: state,
      }));
    },
    [_setCellState],
  );

  const resetCellState = useCallback(
    (columnId: string, rowIndex: number) => {
      _setCellState((prev) => ({
        ...prev,
        [getCellKey(columnId, rowIndex)]: undefined,
      }));
    },
    [_setCellState],
  );

  return {
    cellState,
    getCellState,
    setCellState,
    resetCellState,
  };
}

function getCellKey(columnId: string, rowIndex: number) {
  return `${columnId}_${rowIndex}`;
}
