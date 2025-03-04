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
}: VirtualGridOptions<TData>): VirtualGrid => {
  const { rows: tableRows } = table.getRowModel();
  const visibleColumns = table.getVisibleLeafColumns();

  const pinnedColumnsIndices = useMemo(
    () => table.getLeftVisibleLeafColumns().map(c => c.getPinnedIndex()),
    [table],
  );

  const columnVirtualizer = useVirtualizer({
    count: visibleColumns.length,
    getScrollElement: () => gridRef.current,
    estimateSize: index => {
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

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => gridRef.current,
    estimateSize: () => defaultRowHeight,
    overscan: 3,
    measureElement: element => {
      const rowIndexRaw = element?.getAttribute("data-index");
      const rowIndex = rowIndexRaw != null ? parseInt(rowIndexRaw, 10) : null;
      if (rowIndex == null || !isFinite(rowIndex)) {
        return defaultRowHeight;
      }

      return measureRowHeight(rowIndex);
    },
  });

  const measureGrid = useCallback(() => {
    Array.from(rowVirtualizer.elementsCache.values()).forEach(el =>
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
