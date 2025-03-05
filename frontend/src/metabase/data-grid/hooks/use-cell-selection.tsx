import type { Cell, Table } from "@tanstack/react-table";
import { useCallback, useState } from "react";

export type UseCellSelectionProps = {
  table: Table<unknown>;
  scrollToRow?: (index: number) => void;
  onChangeSelection?: (
    selectedCount: number,
    isKeyboardNavigation: boolean,
  ) => void;
};

export type Selection = {
  handleCellMouseDown: (
    e: React.MouseEvent<HTMLElement>,
    cell: Cell<unknown, unknown>,
  ) => void;
  handleCellMouseUp: (
    e: React.MouseEvent<HTMLElement>,
    cell: Cell<unknown, unknown>,
  ) => void;
  handleCellMouseOver: (
    e: React.MouseEvent<HTMLElement>,
    cell: Cell<unknown, unknown>,
  ) => void;
  handleCellsKeyDown: (
    e: React.MouseEvent<HTMLElement>,
    cell: Cell<unknown, unknown>,
  ) => void;
  isCellSelected: (cell: Cell<unknown, unknown>) => boolean;
  isRowSelected: (rowId: string) => boolean;
  selectedCells: SelectedCell[];
};

export type SelectedCell = {
  rowId: string;
  columnId: string;
  cellId: string;
};

export const useCellSelection = (
  table: Table<unknown>,
  scrollToRow?: (index: number) => void,
  onChangeSelection?: (
    selectedCount: number,
    isKeyboardNavigation: boolean,
  ) => void,
) => {
  const [selectedCells, setSelectedCells] = useState<SelectedCell[]>([]);

  const [selectedStartCell, setSelectedStartCell] =
    useState<SelectedCell | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(getCellValues(table, selectedCells));
  };

  const handleCellsKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    switch (e.key) {
      case "c": {
        if (e.metaKey || e.ctrlKey) {
          handleCopy();
        }
        break;
      }
      case "ArrowDown": {
        e.preventDefault();
        navigateDown();
        onChangeSelection?.(1, true);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        navigateUp();
        onChangeSelection?.(1, true);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        navigateLeft();
        onChangeSelection?.(1, true);
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        navigateRight();
        onChangeSelection?.(1, true);
        break;
      }
    }
  };

  const getLastSelectedCell = useCallback(() => {
    const lastSelectedCell = selectedCells[selectedCells.length - 1];
    if (!lastSelectedCell) {
      return;
    }

    const { rowId, columnId } = lastSelectedCell;

    const row = table.getRow(rowId);
    const rowIndex = table
      .getRowModel()
      .rows.findIndex(row => row.id === rowId);

    const column = table.getColumn(columnId);
    const columnIndex = table
      .getAllFlatColumns()
      .findIndex(column => column.id === columnId);

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
      .find(c => c.column.id === selectedCell.columnId);
    if (previousRowCell) {
      setSelectedCells([getCellSelectionData(previousRowCell)]);
      scrollToRow?.(previousRowIndex);
    }
  }, [getLastSelectedCell, table, scrollToRow]);

  const navigateDown = useCallback(() => {
    const selectedCell = getLastSelectedCell();
    if (!selectedCell) {
      return;
    }
    const nextRowIndex = selectedCell.rowIndex + 1;
    const nextRow = table.getRowModel().rows[nextRowIndex];
    const nextRowCell = nextRow
      ?.getAllCells()
      .find(c => c.column.id === selectedCell.columnId);
    if (nextRowCell) {
      setSelectedCells([getCellSelectionData(nextRowCell)]);
      scrollToRow?.(nextRowIndex);
    }
  }, [getLastSelectedCell, table, scrollToRow]);

  const navigateLeft = useCallback(() => {
    const selectedCell = getLastSelectedCell();
    if (!selectedCell) {
      return;
    }
    const previousCell =
      selectedCell.row.getAllCells()[selectedCell.columnIndex - 1];
    if (previousCell) {
      setSelectedCells([getCellSelectionData(previousCell)]);
    }
  }, [getLastSelectedCell]);

  const navigateRight = useCallback(() => {
    const selectedCell = getLastSelectedCell();
    if (!selectedCell) {
      return;
    }
    const nextCell =
      selectedCell.row.getAllCells()[selectedCell.columnIndex + 1];
    if (nextCell) {
      setSelectedCells([getCellSelectionData(nextCell)]);
    }
  }, [getLastSelectedCell]);

  const isRowSelected = useCallback(
    (rowId: string) => selectedCells.find(c => c.rowId === rowId) !== undefined,
    [selectedCells],
  );

  const isCellSelected = useCallback(
    (cell: Cell<unknown, unknown>) =>
      selectedCells.find(c => c.cellId === cell.id) !== undefined,
    [selectedCells],
  );

  const updateRangeSelection = useCallback(
    (cell: Cell<unknown, unknown>) => {
      if (!selectedStartCell) {
        return;
      }

      const selectedCellsInRange = getCellsBetween(
        table,
        selectedStartCell,
        getCellSelectionData(cell),
      ) as SelectedCell[];

      setSelectedCells(prev => {
        const startIndex = prev.findIndex(
          c => c.cellId === selectedStartCell.cellId,
        );
        const prevSelectedCells = prev.slice(0, startIndex);
        const newCellSelection = selectedCellsInRange.filter(
          c => c.cellId !== selectedStartCell.cellId,
        );

        return [...prevSelectedCells, selectedStartCell, ...newCellSelection];
      });
    },
    [selectedStartCell, table],
  );

  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>, cell: Cell<unknown, unknown>) => {
      if (!e.ctrlKey && !e.shiftKey) {
        setSelectedCells([getCellSelectionData(cell)]);
        if (!isMouseDown) {
          setSelectedStartCell(getCellSelectionData(cell));
        }
      }

      if (e.ctrlKey) {
        setSelectedCells(prev =>
          prev.find(c => c.cellId === cell.id) !== undefined
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
    (_e: React.MouseEvent<HTMLElement>, _cell: Cell<unknown, unknown>) => {
      setIsMouseDown(false);
    },
    [],
  );

  const handleCellMouseOver = useCallback(
    (e: React.MouseEvent<HTMLElement>, cell: Cell<unknown, unknown>) => {
      if (e.buttons !== 1) {
        return;
      }

      onChangeSelection?.(selectedCells.length, false);

      if (isMouseDown) {
        updateRangeSelection(cell);
      }
    },
    [
      isMouseDown,
      onChangeSelection,
      selectedCells.length,
      updateRangeSelection,
    ],
  );

  return {
    handleCellMouseDown,
    handleCellMouseUp,
    handleCellMouseOver,
    handleCellsKeyDown,
    isCellSelected,
    isRowSelected,
    selectedCells,
  };
};

type SelectedCellRowMap = Record<string, SelectedCell[]>;
const getCellValues = (table: Table<unknown>, cells: SelectedCell[]) => {
  const rows = cells.reduce(
    (acc: SelectedCellRowMap, cellIds: SelectedCell) => {
      const cellsForRow = acc[cellIds.rowId] ?? [];
      return {
        ...acc,
        [cellIds.rowId]: [...cellsForRow, cellIds],
      };
    },
    {} as SelectedCellRowMap,
  );

  return Object.keys(rows)
    .map(rowId => {
      const selectedCells = rows[rowId]!;
      const row = table.getRow(rowId);

      const cellValues = [];
      for (const cell of row.getAllCells()) {
        if (selectedCells.find(c => c.cellId === cell.id)) {
          cellValues.push(cell?.getValue());
        }
      }

      return cellValues.join("\t");
    })
    .join("\n");
};

const getCellSelectionData = (cell: Cell<unknown, unknown>) => ({
  rowId: cell.row.id,
  columnId: cell.column.id,
  cellId: cell.id,
});

const getSelectedCellTableData = (
  table: Table<unknown>,
  cell: SelectedCell,
) => {
  const row = table.getRow(cell.rowId);
  return row.getAllCells().find(c => c.id === cell.cellId);
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

  return selectedRows.flatMap(row =>
    columns.map(column => {
      const tableCell = row
        .getAllCells()
        .find(cell => cell.column.id === column.id);
      if (!tableCell) {
        return null;
      }
      return getCellSelectionData(tableCell);
    }),
  );
};
