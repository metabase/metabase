import type { Table as ReactTable } from "@tanstack/react-table";
import {
  type VirtualItem,
  type Virtualizer,
  useVirtualizer,
} from "@tanstack/react-virtual";
import type React from "react";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

interface VirtualGridOptions<TData> {
  gridRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<TData>;
  getRowHeight: (rowIndex: number) => number;
  pinnedTopRowsCount: number;
  enableRowVirtualization?: boolean;
}

export interface VirtualGrid {
  virtualColumns: VirtualItem[];
  virtualRows: VirtualItem[];
  virtualPaddingLeft: number;
  virtualPaddingRight: number;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  columnVirtualizer: Virtualizer<HTMLDivElement, Element>;
  measureGrid: () => void;
  scrollTo: (options: { rowIndex?: number; columnIndex?: number }) => void;
}

export const useVirtualGrid = <TData,>({
  gridRef,
  table,
  getRowHeight,
  pinnedTopRowsCount,
  enableRowVirtualization,
}: VirtualGridOptions<TData>): VirtualGrid => {
  const centerColumns = table.getCenterLeafColumns();
  const centerRows = table.getCenterRows();

  const columnVirtualizer = useVirtualizer({
    count: centerColumns.length,
    getScrollElement: () => gridRef.current,
    estimateSize: (index) => {
      const column = centerColumns[index];
      const size = column.getSize();
      const actualSize = table.getState().columnSizing[column.id];
      return actualSize ?? size;
    },
    horizontal: true,
    overscan: 3,
  });

  const centerColumnKey = useMemo(
    () => centerColumns.map((c) => c.id).join(","),
    [centerColumns],
  );

  const prevCenterColumnKey = useRef(centerColumnKey);
  useLayoutEffect(() => {
    if (prevCenterColumnKey.current !== centerColumnKey) {
      prevCenterColumnKey.current = centerColumnKey;
      columnVirtualizer.measure();
    }
  }, [centerColumnKey, columnVirtualizer]);

  const rowVirtualizer = useVirtualizer({
    count: centerRows.length,
    getScrollElement: () => gridRef.current,
    estimateSize: (index) => getRowHeight(index + pinnedTopRowsCount),
    overscan: 3,
    enabled: enableRowVirtualization,
  });

  const measureGrid = useCallback(() => {
    columnVirtualizer.measure();
  }, [columnVirtualizer]);

  const pinnedColumnsCount = table.getLeftLeafColumns().length;
  const scrollTo = useCallback(
    ({
      rowIndex,
      columnIndex,
    }: {
      rowIndex?: number;
      columnIndex?: number;
    }) => {
      if (rowIndex != null) {
        rowVirtualizer.scrollToIndex(rowIndex);
      }
      if (columnIndex != null && columnIndex >= pinnedColumnsCount) {
        columnVirtualizer.scrollToIndex(columnIndex - pinnedColumnsCount);
      }
    },
    [rowVirtualizer, columnVirtualizer, pinnedColumnsCount],
  );

  const virtualColumns = columnVirtualizer.getVirtualItems();
  const virtualRows = rowVirtualizer.getVirtualItems();

  const virtualPaddingLeft = virtualColumns[0]?.start ?? 0;
  const virtualPaddingRight =
    columnVirtualizer.getTotalSize() - (virtualColumns.at(-1)?.end ?? 0);

  return {
    virtualColumns,
    virtualRows,
    virtualPaddingLeft,
    virtualPaddingRight,
    rowVirtualizer,
    columnVirtualizer,
    measureGrid,
    scrollTo,
  };
};
