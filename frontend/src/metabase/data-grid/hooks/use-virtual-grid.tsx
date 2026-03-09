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
  scrollRef: React.RefObject<HTMLDivElement>;
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
  scrollRef,
  table,
  measureRowHeight,
  defaultRowHeight,
  enableRowVirtualization,
}: VirtualGridOptions<TData>): VirtualGrid => {
  const { rows: tableRows } = table.getRowModel();
  const centralColumns = table.getCenterLeafColumns();

  const columnVirtualizer = useVirtualizer({
    count: centralColumns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const column = centralColumns[index];
      const size = centralColumns[index].getSize();
      const actualSize = table.getState().columnSizing[column.id];
      return actualSize ?? size;
    },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (columnVirtualizer && virtualColumns?.length) {
      virtualPaddingLeft = virtualColumns[0]?.start ?? 0;

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
    measureGrid,
  ]);
};
