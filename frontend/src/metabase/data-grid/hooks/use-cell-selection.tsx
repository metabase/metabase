import type { Cell, Table } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import _ from "underscore";

import type { DataGridSelection, SelectedCell } from "../types";

const noopHandlers: DataGridSelection["handlers"] = {
  handleCellMouseDown: _.noop,
  handleCellMouseUp: _.noop,
  handleCellMouseOver: _.noop,
  handleCellsKeyDown: _.noop,
};

export type SelectedCellRowMap = Record<string, SelectedCell[]>;

interface UseCellSelectionProps {
  gridRef: React.RefObject<HTMLDivElement>;
  table: Table<any>;
  isEnabled?: boolean;
  scrollTo?: ({
    rowIndex,
    columnIndex,
  }: {
    rowIndex?: number;
    columnIndex?: number;
  }) => void;
  onChangeSelection?: (cells: SelectedCell[]) => void;
}

export const useCellSelection = ({
  gridRef,
  table,
  isEnabled = false,
  scrollTo,
  onChangeSelection,
}: UseCellSelectionProps): DataGridSelection => {
  const [selectedCells, setSelectedCells] = useState<SelectedCell[]>([]);

  const [selectedStartCell, setSelectedStartCell] =
    useState<SelectedCell | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(getCellValues(table, selectedCells));
  }, [table, selectedCells]);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (!isEnabled || !gridRef?.current) {
        return;
      }

      if (!gridRef.current.contains(event.target as Node)) {
        setSelectedCells([]);
        onChangeSelection?.([]);
      }
    },
    [isEnabled, gridRef, onChangeSelection],
  );

  useEffect(() => {
    if (isEnabled && gridRef?.current) {
      document.addEventListener("mousedown", handleClickOutside);

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isEnabled, gridRef, handleClickOutside]);

  const canSelectCell = useCallback((cell: Cell<any, any>) => {
    return cell.getContext().column.columnDef.meta?.enableSelection;
  }, []);

  const getLastSelectedCell = useCallback(() => {
    const lastSelectedCell = selectedCells[selectedCells.length - 1];
    if (!lastSelectedCell) {
      return;
    }

    const { rowId, columnId } = lastSelectedCell;

    const row = table.getRow(rowId);
    const rowIndex = table
      .getRowModel()
      .rows.findIndex((row) => row.id === rowId);

    const column = table.getColumn(columnId);
    const columnIndex = table
      .getAllFlatColumns()
      .findIndex((column) => column.id === columnId);

    return {
      row,
      rowIndex,
      rowId,
      column,
      columnIndex,
      columnId,
    };
  }, [selectedCells, table]);

  const navigateUp = useCallback(() => {
    const selectedCell = getLastSelectedCell();
    if (!selectedCell) {
      return;
    }
    const previousRowIndex = selectedCell.rowIndex - 1;
    const previousRow = table.getRowModel().rows[previousRowIndex];
    const previousRowCell = previousRow
      ?.getAllCells()
      .find((c) => c.column.id === selectedCell.columnId);
    if (previousRowCell && canSelectCell(previousRowCell)) {
      const newSelection = [getCellSelectionData(previousRowCell)];
      scrollTo?.({ rowIndex: previousRowIndex });
      return newSelection;
    }
  }, [getLastSelectedCell, table, scrollTo, canSelectCell]);

  const navigateDown = useCallback(() => {
    const selectedCell = getLastSelectedCell();
    if (!selectedCell) {
      return;
    }
    const nextRowIndex = selectedCell.rowIndex + 1;
    const nextRow = table.getRowModel().rows[nextRowIndex];
    const nextRowCell = nextRow
      ?.getAllCells()
      .find((c) => c.column.id === selectedCell.columnId);
    if (nextRowCell && canSelectCell(nextRowCell)) {
      const newSelection = [getCellSelectionData(nextRowCell)];
      scrollTo?.({ rowIndex: nextRowIndex });
      return newSelection;
    }
  }, [getLastSelectedCell, table, scrollTo, canSelectCell]);

  const navigateLeft = useCallback(() => {
    const selectedCell = getLastSelectedCell();
    if (!selectedCell) {
      return;
    }

    const previousColumnIndex = selectedCell.columnIndex - 1;
    const previousCell = selectedCell.row.getAllCells()[previousColumnIndex];
    if (previousCell && canSelectCell(previousCell)) {
      const newSelection = [getCellSelectionData(previousCell)];
      scrollTo?.({ columnIndex: previousColumnIndex });
      return newSelection;
    }
  }, [getLastSelectedCell, canSelectCell, scrollTo]);

  const navigateRight = useCallback(() => {
    const selectedCell = getLastSelectedCell();
    if (!selectedCell) {
      return;
    }

    const nextColumnIndex = selectedCell.columnIndex + 1;
    const nextCell = selectedCell.row.getAllCells()[nextColumnIndex];
    if (nextCell && canSelectCell(nextCell)) {
      const newSelection = [getCellSelectionData(nextCell)];
      scrollTo?.({ columnIndex: nextColumnIndex });
      return newSelection;
    }
  }, [getLastSelectedCell, canSelectCell, scrollTo]);

  const handleCellsKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      let newSelection: SelectedCell[] | undefined;
      switch (e.key) {
        case "Escape": {
          newSelection = [];
          break;
        }
        case "c": {
          if (e.metaKey || e.ctrlKey) {
            handleCopy();
          }
          break;
        }
        case "ArrowDown": {
          newSelection = navigateDown();
          break;
        }
        case "ArrowUp": {
          newSelection = navigateUp();
          break;
        }
        case "ArrowLeft": {
          newSelection = navigateLeft();
          break;
        }
        case "ArrowRight": {
          newSelection = navigateRight();
          break;
        }
      }

      if (newSelection) {
        setSelectedCells(newSelection);
        onChangeSelection?.(newSelection);
      }
    },
    [
      handleCopy,
      onChangeSelection,
      navigateDown,
      navigateUp,
      navigateLeft,
      navigateRight,
    ],
  );

  const isRowSelected = useCallback(
    (rowId: string) => {
      if (!isEnabled) {
        return false;
      }
      return selectedCells.find((c) => c.rowId === rowId) !== undefined;
    },
    [selectedCells, isEnabled],
  );

  const isCellSelected = useCallback(
    (cell: Cell<any, any>) => {
      if (!isEnabled) {
        return false;
      }
      return selectedCells.find((c) => c.cellId === cell.id) !== undefined;
    },
    [selectedCells, isEnabled],
  );

  const updateRangeSelection = useCallback(
    (cell: Cell<any, any>) => {
      if (!selectedStartCell) {
        return;
      }

      const selectedCellsInRange = getCellsBetween(
        table,
        selectedStartCell,
        getCellSelectionData(cell),
      ) as SelectedCell[];

      setSelectedCells((prev) => {
        const startIndex = prev.findIndex(
          (c) => c.cellId === selectedStartCell.cellId,
        );
        const prevSelectedCells = prev.slice(0, startIndex);
        const newCellSelection = selectedCellsInRange.filter(
          (c) => c.cellId !== selectedStartCell.cellId,
        );

        return [...prevSelectedCells, selectedStartCell, ...newCellSelection];
      });
    },
    [selectedStartCell, table],
  );

  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>, cell: Cell<any, any>) => {
      const canSelect =
        cell.getContext().column.columnDef.meta?.enableSelection;
      if (!canSelect) {
        return;
      }

      if (!(e.ctrlKey || e.metaKey) && !e.shiftKey) {
        setSelectedCells([getCellSelectionData(cell)]);
        if (!isMouseDown) {
          setSelectedStartCell(getCellSelectionData(cell));
        }
      }

      if (e.ctrlKey || e.metaKey) {
        setSelectedCells((prev) =>
          prev.find((c) => c.cellId === cell.id) !== undefined
            ? prev.filter(({ cellId }) => cellId !== cell.id)
            : [...prev, getCellSelectionData(cell)],
        );
        if (!isMouseDown) {
          setSelectedStartCell(getCellSelectionData(cell));
        }
      }

      if (e.shiftKey) {
        updateRangeSelection(cell);
      }

      setIsMouseDown(true);
    },
    [isMouseDown, updateRangeSelection],
  );

  const handleCellMouseUp = useCallback(
    (_e: React.MouseEvent<HTMLElement>, _cell: Cell<any, any>) => {
      setIsMouseDown(false);
    },
    [],
  );

  const handleCellMouseOver = useCallback(
    (e: React.MouseEvent<HTMLElement>, cell: Cell<any, any>) => {
      if (e.buttons !== 1) {
        return;
      }

      onChangeSelection?.(selectedCells);

      if (isMouseDown) {
        updateRangeSelection(cell);
      }
    },
    [selectedCells, isMouseDown, onChangeSelection, updateRangeSelection],
  );

  return useMemo(
    () => ({
      isEnabled,
      selectedCells,
      isCellSelected,
      isRowSelected,
      handlers: isEnabled
        ? {
            handleCellMouseDown,
            handleCellMouseUp,
            handleCellMouseOver,
            handleCellsKeyDown,
          }
        : noopHandlers,
    }),
    [
      handleCellMouseDown,
      handleCellMouseUp,
      handleCellMouseOver,
      handleCellsKeyDown,
      isCellSelected,
      isRowSelected,
      selectedCells,
      isEnabled,
    ],
  );
};

const getCellValues = (table: Table<unknown>, cells: SelectedCell[]) => {
  const rows = cells.reduce<SelectedCellRowMap>(
    (acc: SelectedCellRowMap, cellIds: SelectedCell) => {
      const cellsForRow = acc[cellIds.rowId] ?? [];
      return {
        ...acc,
        [cellIds.rowId]: [...cellsForRow, cellIds],
      };
    },
    {},
  );

  return Object.keys(rows)
    .map((rowId) => {
      const selectedCells = rows[rowId]!;
      const row = table.getRow(rowId);

      const cellValues = [];
      for (const cell of row.getAllCells()) {
        if (selectedCells.find((c) => c.cellId === cell.id)) {
          cellValues.push(cell?.getValue());
        }
      }

      return cellValues.join("\t");
    })
    .join("\n");
};

const getCellSelectionData = (cell: Cell<any, any>) => ({
  rowId: cell.row.id,
  columnId: cell.column.id,
  cellId: cell.id,
});

const getSelectedCellTableData = (
  table: Table<unknown>,
  cell: SelectedCell,
) => {
  const row = table.getRow(cell.rowId);
  return row.getAllCells().find((c) => c.id === cell.cellId);
};

const getCellsBetween = (
  table: Table<unknown>,
  cell1: SelectedCell,
  cell2: SelectedCell,
) => {
  const cell1Data = getSelectedCellTableData(table, cell1);
  const cell2Data = getSelectedCellTableData(table, cell2);
  if (!cell1Data || !cell2Data) {
    return [];
  }

  const rows = table.getRowModel().rows;

  const cell1RowIndex = rows.findIndex(({ id }) => id === cell1Data.row.id);
  const cell2RowIndex = rows.findIndex(({ id }) => id === cell2Data.row.id);

  const cell1ColumnIndex = cell1Data.column.getIndex();
  const cell2ColumnIndex = cell2Data.column.getIndex();

  const selectedRows = rows.slice(
    Math.min(cell1RowIndex, cell2RowIndex),
    Math.max(cell1RowIndex, cell2RowIndex) + 1,
  );

  const columns = table
    .getAllColumns()
    .slice(
      Math.min(cell1ColumnIndex, cell2ColumnIndex),
      Math.max(cell1ColumnIndex, cell2ColumnIndex) + 1,
    );

  return selectedRows.flatMap((row) =>
    columns.map((column) => {
      const tableCell = row
        .getAllCells()
        .find((cell) => cell.column.id === column.id);
      if (!tableCell) {
        return null;
      }
      return getCellSelectionData(tableCell);
    }),
  );
};
