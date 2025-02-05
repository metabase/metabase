import type { Cell, Table } from "@tanstack/react-table";
import { useState } from "react";
import { useCopyToClipboard } from "react-use";

export type UseCellSelectionProps = {
  table: Table<any>;
  scrollToRow?: (index: number) => void;
};

export type SelectedCell = {
  rowId: string;
  columnId: string;
  cellId: string;
};

export const useCellSelection = ({
  table,
  scrollToRow,
}: UseCellSelectionProps) => {
  const [selectedCells, setSelectedCells] = useState<SelectedCell[]>([]);
  const [copiedCells, setCopiedCells] = useState<SelectedCell[]>([]);

  const [selectedStartCell, setSelectedStartCell] =
    useState<SelectedCell | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);

  const [_copiedText, copy] = useCopyToClipboard();
  const handleCopy = () => {
    copy(getCellValues(table, selectedCells));

    setCopiedCells(selectedCells);
    setTimeout(() => {
      setCopiedCells([]);
    }, 500);
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
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        navigateUp();
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        navigateLeft();
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        navigateRight();
        break;
      }
      case "Home": {
        e.preventDefault();
        navigateHome();
        break;
      }
      case "End": {
        e.preventDefault();
        navigateEnd();
        break;
      }
    }
  };

  const navigateHome = () => {
    const firstCell = table.getRowModel().rows[0]?.getAllCells()[0];
    if (!firstCell) {
      return;
    }

    setSelectedCells([getCellSelectionData(firstCell)]);
    scrollToRow?.(0);
  };

  const navigateEnd = () => {
    const lastRow =
      table.getRowModel().rows[table.getRowModel().rows.length - 1];
    const lastCell = lastRow?.getAllCells()[lastRow.getAllCells().length - 1];
    if (!lastCell) {
      return;
    }

    setSelectedCells([getCellSelectionData(lastCell)]);
    scrollToRow?.(table.getRowModel().rows.length);
  };

  const navigateUp = () => {
    const selectedCell = selectedCells[selectedCells.length - 1];
    if (!selectedCell) {
      return;
    }

    const selectedRowIndex = table
      .getRowModel()
      .rows.findIndex(row => row.id === selectedCell.rowId);
    const nextRowIndex = selectedRowIndex - 1;
    const previousRow = table.getRowModel().rows[nextRowIndex];
    if (previousRow) {
      setSelectedCells([
        getCellSelectionData(
          previousRow
            .getAllCells()
            .find(c => c.column.id === selectedCell.columnId)!,
        ),
      ]);
      scrollToRow?.(nextRowIndex);
    }
  };

  const navigateDown = () => {
    const selectedCell = selectedCells[selectedCells.length - 1];
    if (!selectedCell) {
      return;
    }

    const selectedRowIndex = table
      .getRowModel()
      .rows.findIndex(row => row.id === selectedCell.rowId);
    const nextRowIndex = selectedRowIndex + 1;
    const nextRow = table.getRowModel().rows[nextRowIndex];
    if (nextRow) {
      setSelectedCells([
        getCellSelectionData(
          nextRow
            .getAllCells()
            .find(c => c.column.id === selectedCell.columnId)!,
        ),
      ]);
      scrollToRow?.(nextRowIndex);
    }
  };

  const navigateLeft = () => {
    const selectedCell = selectedCells[selectedCells.length - 1];
    if (!selectedCell) {
      return;
    }

    const selectedRow = table.getRow(selectedCell.rowId);
    const selectedColumnIndex = selectedRow
      .getAllCells()
      .findIndex(c => c.id === selectedCell.cellId);
    const previousCell = selectedRow.getAllCells()[selectedColumnIndex - 1];
    if (previousCell) {
      setSelectedCells([getCellSelectionData(previousCell)]);
    }
  };

  const navigateRight = () => {
    const selectedCell = selectedCells[selectedCells.length - 1];
    if (!selectedCell) {
      return;
    }

    const selectedRow = table.getRow(selectedCell.rowId);
    const selectedColumnIndex = selectedRow
      .getAllCells()
      .findIndex(c => c.id === selectedCell.cellId);
    const nextCell = selectedRow.getAllCells()[selectedColumnIndex + 1];
    if (nextCell) {
      setSelectedCells([getCellSelectionData(nextCell)]);
    }
  };

  const isRowSelected = (rowId: string) =>
    selectedCells.find(c => c.rowId === rowId) !== undefined;

  const isCellSelected = (cell: Cell<any, any>) =>
    selectedCells.find(c => c.cellId === cell.id) !== undefined;

  const isCellCopied = (cell: Cell<any, any>) =>
    copiedCells.find(c => c.cellId === cell.id) !== undefined;

  const updateRangeSelection = (cell: Cell<any, any>) => {
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
  };

  const handleCellMouseDown = (
    e: React.MouseEvent<HTMLElement>,
    cell: Cell<any, any>,
  ) => {
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
  };

  const handleCellMouseUp = (
    e: React.MouseEvent<HTMLElement>,
    _cell: Cell<any, any>,
  ) => {
    setIsMouseDown(false);
  };

  const handleCellMouseOver = (
    e: React.MouseEvent<HTMLElement>,
    cell: Cell<any, any>,
  ) => {
    if (e.buttons !== 1) {
      return;
    }

    if (isMouseDown) {
      updateRangeSelection(cell);
    }
  };

  return {
    handleCellMouseDown,
    handleCellMouseUp,
    handleCellMouseOver,
    handleCellsKeyDown,
    isCellSelected,
    isRowSelected,
    isCellCopied,
  };
};

type SelectedCellRowMap = Record<string, SelectedCell[]>;
const getCellValues = (table: Table<any>, cells: SelectedCell[]) => {
  // reduce cells into arrays of rows
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

const getCellSelectionData = (cell: Cell<any, any>) => ({
  rowId: cell.row.id,
  columnId: cell.column.id,
  cellId: cell.id,
});

const getSelectedCellTableData = (table: Table<any>, cell: SelectedCell) => {
  const row = table.getRow(cell.rowId);
  return row.getAllCells().find(c => c.id === cell.cellId);
};

const getCellsBetween = (
  table: Table<any>,
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
