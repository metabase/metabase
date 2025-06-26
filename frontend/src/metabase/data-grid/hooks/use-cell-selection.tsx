import type { Cell, Row, Table } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import _ from "underscore";

import type { CellId, DataGridSelection } from "../types";
import { formatCellValueForCopy } from "../utils/formatting";

const noopHandlers: DataGridSelection["handlers"] = {
  handleCellMouseDown: _.noop,
  handleCellMouseUp: _.noop,
  handleCellMouseOver: _.noop,
  handleCellDoubleClick: _.noop,
};

export type SelectedCellRowMap = Record<string, CellId[]>;

/**
 * Configuration options for the cell selection hook.
 */
interface UseCellSelectionProps {
  /** Table instance from TanStack Table */
  table: Table<any>;
  /** Whether cell selection is enabled */
  isEnabled?: boolean;
  /** Optional function to scroll to a specific cell */
  scrollTo?: ({
    rowIndex,
    columnIndex,
  }: {
    rowIndex?: number;
    columnIndex?: number;
  }) => void;
  /** Callback when selection changes */
  onChangeSelection?: (cells: CellId[]) => void;
}

/**
 * Hook that provides cell selection functionality for data grids.
 *
 * Features:
 * - Single and multi-cell selection with mouse and keyboard
 * - Copy selected cells with Cmd/Ctrl+C (formatted) or Shift+Cmd/Ctrl+C (raw)
 * - Keyboard navigation with arrow keys
 * - Click outside to clear selection
 *
 * @param props - Configuration options
 * @returns Object with selection state and event handlers
 */
export const useCellSelection = ({
  table,
  isEnabled = false,
  scrollTo,
  onChangeSelection,
}: UseCellSelectionProps): DataGridSelection => {
  const [selectedCells, setSelectedCells] = useState<CellId[]>([]);
  const [focusedCell, setFocusedCell] = useState<CellId | null>(null);
  const [selectedStartCell, setSelectedStartCell] = useState<CellId | null>(
    null,
  );
  const [isMouseDown, setIsMouseDown] = useState(false);

  const handleCopy = useCallback(
    async (useRawValues = false) => {
      const formattedText = getCellValues(table, selectedCells, useRawValues);
      await navigator.clipboard.writeText(formattedText);
    },
    [table, selectedCells],
  );

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (!isEnabled) {
        return;
      }

      const target = e.target as HTMLElement;
      const isInsideSelectableCell = target.closest("[data-selectable-cell]");
      if (isInsideSelectableCell || selectedCells.length === 0) {
        return;
      }

      setSelectedCells([]);
      setFocusedCell(null);
      setSelectedStartCell(null);
      onChangeSelection?.([]);
    },
    [isEnabled, onChangeSelection, selectedCells.length],
  );

  useEffect(() => {
    if (isEnabled) {
      document.addEventListener("mousedown", handleClickOutside);

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isEnabled, handleClickOutside]);

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
  }, [getLastSelectedCell, table, scrollTo]);

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
  }, [getLastSelectedCell, table, scrollTo]);

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
  }, [getLastSelectedCell, scrollTo]);

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
  }, [getLastSelectedCell, scrollTo]);

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

  const isCellFocused = useCallback(
    (cell: Cell<any, any>) => {
      if (!isEnabled || !focusedCell) {
        return false;
      }
      return focusedCell.cellId === cell.id;
    },
    [focusedCell, isEnabled],
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
      ) as CellId[];

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
      if (!_.isEqual(focusedCell, getCellSelectionData(cell))) {
        setFocusedCell(null);
      }

      if (!canSelectCell(cell)) {
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
    [focusedCell, isMouseDown, updateRangeSelection],
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
    [isMouseDown, onChangeSelection, selectedCells, updateRangeSelection],
  );

  const handleCellDoubleClick = useCallback(
    (cell: Cell<any, any>) => {
      if (!canSelectCell(cell)) {
        return;
      }

      const cellData = getCellSelectionData(cell);
      setFocusedCell(cellData);
      const newSelection = [cellData];
      setSelectedCells(newSelection);
      onChangeSelection?.(newSelection);
    },
    [onChangeSelection],
  );

  // Attach keyboard handlers to window when we have selection or focused cell
  useEffect(() => {
    if (!isEnabled || selectedCells.length === 0) {
      return;
    }

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      let handled = false;

      switch (e.key) {
        case "Escape": {
          handled = true;
          setSelectedCells([]);
          setFocusedCell(null);
          setSelectedStartCell(null);
          onChangeSelection?.([]);
          break;
        }
        case "c": {
          if (e.metaKey || e.ctrlKey) {
            if (focusedCell) {
              return;
            }
            handled = true;
            if (e.shiftKey) {
              handleCopy(true);
            } else {
              handleCopy();
            }
          }
          break;
        }
        case "ArrowDown": {
          handled = true;
          const newSelection = navigateDown();
          if (newSelection) {
            setSelectedCells(newSelection);
            onChangeSelection?.(newSelection);
          }
          break;
        }
        case "ArrowUp": {
          handled = true;
          const newSelection = navigateUp();
          if (newSelection) {
            setSelectedCells(newSelection);
            onChangeSelection?.(newSelection);
          }
          break;
        }
        case "ArrowLeft": {
          handled = true;
          const newSelection = navigateLeft();
          if (newSelection) {
            setSelectedCells(newSelection);
            onChangeSelection?.(newSelection);
          }
          break;
        }
        case "ArrowRight": {
          handled = true;
          const newSelection = navigateRight();
          if (newSelection) {
            setSelectedCells(newSelection);
            onChangeSelection?.(newSelection);
          }
          break;
        }
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [
    isEnabled,
    selectedCells,
    focusedCell,
    handleCopy,
    navigateDown,
    navigateUp,
    navigateLeft,
    navigateRight,
    onChangeSelection,
  ]);

  return useMemo(
    () => ({
      isEnabled,
      selectedCells,
      focusedCell,
      isCellSelected,
      isCellFocused,
      isRowSelected,
      handlers: isEnabled
        ? {
            handleCellMouseDown,
            handleCellMouseUp,
            handleCellMouseOver,
            handleCellDoubleClick,
          }
        : noopHandlers,
    }),
    [
      handleCellMouseDown,
      handleCellMouseUp,
      handleCellMouseOver,
      handleCellDoubleClick,
      isCellSelected,
      isCellFocused,
      isRowSelected,
      selectedCells,
      focusedCell,
      isEnabled,
    ],
  );
};

const groupCellsByRow = (cells: CellId[]): SelectedCellRowMap => {
  return cells.reduce<SelectedCellRowMap>((acc, cellData) => {
    const cellsForRow = acc[cellData.rowId] ?? [];
    return {
      ...acc,
      [cellData.rowId]: [...cellsForRow, cellData],
    };
  }, {});
};

/**
 * Extracts values from cells in a single row, applying formatting as needed.
 */
const extractRowCellValues = (
  row: Row<unknown>,
  selectedCells: CellId[],
  useRawValues: boolean,
): string[] => {
  const cellValues: string[] = [];
  const selectedCellIds = new Set(selectedCells.map((c) => c.cellId));

  for (const cell of row.getAllCells()) {
    if (selectedCellIds.has(cell.id)) {
      const rawValue = cell.getValue();
      const clipboardFormatter = useRawValues
        ? undefined
        : cell.column.columnDef.meta?.clipboardFormatter;
      const formattedValue = formatCellValueForCopy(
        rawValue,
        clipboardFormatter,
        row.index,
        cell.column.id,
      );

      cellValues.push(formattedValue);
    }
  }

  return cellValues;
};

/**
 * Converts selected cells to clipboard-ready text format.
 *
 * @param table - The table instance
 * @param cells - Array of selected cells
 * @param useRawValues - Whether to use raw values instead of formatted ones
 * @returns Tab-separated values with newlines between rows
 */
const getCellValues = (
  table: Table<unknown>,
  cells: CellId[],
  useRawValues = false,
): string => {
  if (cells.length === 0) {
    return "";
  }

  const rowGroups = groupCellsByRow(cells);

  return Object.keys(rowGroups)
    .map((rowId) => {
      try {
        const row = table.getRow(rowId);
        const selectedCells = rowGroups[rowId]!;
        const cellValues = extractRowCellValues(
          row,
          selectedCells,
          useRawValues,
        );
        return cellValues.join("\t");
      } catch (error) {
        console.warn(`Error processing row ${rowId}:`, error);
        return "";
      }
    })
    .filter((rowText) => rowText.length > 0)
    .join("\n");
};

const canSelectCell = (cell: Cell<any, any>) => {
  return cell.column.columnDef.meta?.enableSelection;
};

const getCellSelectionData = (cell: Cell<any, any>): CellId => ({
  rowId: cell.row.id,
  columnId: cell.column.id,
  cellId: cell.id,
});

const getSelectedCellTableData = (table: Table<unknown>, cell: CellId) => {
  const row = table.getRow(cell.rowId);
  return row.getAllCells().find((c) => c.id === cell.cellId);
};

const getCellsBetween = (
  table: Table<unknown>,
  cell1: CellId,
  cell2: CellId,
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
