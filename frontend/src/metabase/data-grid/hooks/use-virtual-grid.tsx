import type { Table as ReactTable } from "@tanstack/react-table";
import {
  type Range,
  type VirtualItem,
  type Virtualizer,
  defaultRangeExtractor,
  useVirtualizer,
} from "@tanstack/react-virtual";
import type React from "react";
import { useCallback, useMemo } from "react";

interface VirtualGridOptions<TData> {
  gridRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<TData>;
  measureRowHeight: (rowIndex: number) => number;
  defaultRowHeight: number;
  enableRowVirtualization?: boolean;
}

export interface VirtualGrid {
  virtualColumns: VirtualItem[];
  virtualRows: VirtualItem[];
  virtualPaddingLeft: number | undefined;
  virtualPaddingRight: number | undefined;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  columnVirtualizer: Virtualizer<HTMLDivElement, Element>;
  measureGrid: () => void;
}

export const useVirtualGrid = <TData,>({
  gridRef,
  table,
  measureRowHeight,
  defaultRowHeight,
  enableRowVirtualization,
}: VirtualGridOptions<TData>): VirtualGrid => {
  const { rows: tableRows } = table.getRowModel();
  const visibleColumns = table.getVisibleLeafColumns();

  const columnPinning = table.getState().columnPinning;
  const pinnedColumnsIndices = useMemo(
    () => table.getLeftVisibleLeafColumns().map((c) => c.getPinnedIndex()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `columnPinning` affects pinnedColumnsIndices
    [table, columnPinning],
  );

  const columnVirtualizer = useVirtualizer({
    count: visibleColumns.length,
    getScrollElement: () => gridRef.current,
    estimateSize: (index) => {
      const column = visibleColumns[index];
      const size = visibleColumns[index].getSize();
      const actualSize = table.getState().columnSizing[column.id];
      return actualSize ?? size;
    },
    rangeExtractor: useCallback(
      (range: Range) => {
        const columnIndices = defaultRangeExtractor(range);
        if (pinnedColumnsIndices.length === 0) {
          return columnIndices;
        }
        return Array.from(new Set([...pinnedColumnsIndices, ...columnIndices]));
      },
      [pinnedColumnsIndices],
    ),
    horizontal: true,
    overscan: 3,
  });

  const rowPinning = table.getState().rowPinning;

  const pinnedRowIndices = useMemo(
    () =>
      table
        .getTopRows()
        .concat(table.getBottomRows())
        .map((row) => row.getPinnedIndex()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rowPinning` affects pinnedRowIndices
    [table, rowPinning],
  );

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => gridRef.current,
    estimateSize: () => defaultRowHeight,
    rangeExtractor: useCallback(
      (range: Range) => {
        const rowIndices = defaultRangeExtractor(range);
        if (pinnedRowIndices.length === 0) {
          return rowIndices;
        }
        return Array.from(new Set([...pinnedRowIndices, ...rowIndices]));
      },
      [pinnedRowIndices],
    ),
    overscan: 3,
    enabled: enableRowVirtualization,
    measureElement: (element) => {
      if (!element) {
        return defaultRowHeight;
      }
      let contentHeight = defaultRowHeight;
      const rowIndexRaw = element.getAttribute("data-dataset-index");
      if (rowIndexRaw) {
        const rowIndex = parseInt(rowIndexRaw, 10);
        contentHeight = measureRowHeight(rowIndex);
      }
      if (element instanceof HTMLElement) {
        return Math.max(contentHeight, element.offsetHeight);
      }
      return contentHeight;
    },
  });

  const measureGrid = useCallback(() => {
    Array.from(rowVirtualizer.elementsCache.values()).forEach((el) =>
      rowVirtualizer.measureElement(el),
    );
    columnVirtualizer.measure();
  }, [rowVirtualizer, columnVirtualizer]);

  const virtualColumns = columnVirtualizer.getVirtualItems();
  const virtualRows = rowVirtualizer.getVirtualItems();

  return useMemo(() => {
    let virtualPaddingLeft: number | undefined;
    let virtualPaddingRight: number | undefined;

    const pinnedCount = pinnedColumnsIndices.length;

    if (columnVirtualizer && virtualColumns?.length) {
      const leftNonPinnedStart = virtualColumns[pinnedCount]?.start ?? 0;
      const leftNonPinnedEnd =
        virtualColumns[pinnedColumnsIndices.length - 1]?.end ?? 0;

      virtualPaddingLeft = leftNonPinnedStart - leftNonPinnedEnd;

      virtualPaddingRight =
        columnVirtualizer.getTotalSize() -
        (virtualColumns[virtualColumns.length - 1]?.end ?? 0);
    }

    return {
      virtualColumns,
      virtualRows,
      virtualPaddingLeft,
      virtualPaddingRight,
      rowVirtualizer,
      columnVirtualizer,
      measureGrid,
    };
  }, [
    virtualColumns,
    virtualRows,
    rowVirtualizer,
    columnVirtualizer,
    pinnedColumnsIndices.length,
    measureGrid,
  ]);
};
