import type { Table as ReactTable } from "@tanstack/react-table";
import {
  type VirtualItem,
  type Virtualizer,
  useVirtualizer,
} from "@tanstack/react-virtual";
import type React from "react";
import { useCallback, useMemo } from "react";

interface VirtualGridProps<TData> {
  gridRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<TData>;
  defaultRowHeight: number;
  enableRowVirtualization?: boolean;
  getRowHeight: (index: number) => number;
  datasetIndexAttributeName: string;
  virtualIndexAttributeName: string;
}

export interface VirtualGrid {
  virtualColumns: VirtualItem[];
  virtualRows: VirtualItem[];
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  columnVirtualizer: Virtualizer<HTMLDivElement, Element>;
  rowMeasureRef: (element: Element | null) => void;
  measureGrid: () => void;
  virtualIndexAttributeName: string;
}

export const useVirtualGrid = <TData,>({
  gridRef,
  table,
  defaultRowHeight,
  enableRowVirtualization,
  getRowHeight,
  datasetIndexAttributeName,
  virtualIndexAttributeName,
}: VirtualGridProps<TData>): VirtualGrid => {
  const centerColumns = table.getCenterLeafColumns();
  const centerRows = table.getCenterRows();
  const leftPinnedColumnsWidth = table.getLeftTotalSize();

  const columnVirtualizer = useVirtualizer({
    count: centerColumns.length,
    getScrollElement: () => gridRef.current,
    estimateSize: (index) => centerColumns[index].getSize(),
    horizontal: true,
    overscan: 3,
    scrollMargin: leftPinnedColumnsWidth,
  });

  const rowVirtualizer = useVirtualizer({
    count: centerRows.length,
    indexAttribute: virtualIndexAttributeName,
    getScrollElement: () => gridRef.current,
    estimateSize: () => defaultRowHeight,
    overscan: 3,
    enabled: enableRowVirtualization,
    measureElement: (element) => {
      const indexRaw = element.getAttribute(datasetIndexAttributeName);
      if (!indexRaw) {
        return defaultRowHeight;
      }
      const index = parseInt(indexRaw, 10);
      return getRowHeight(index);
    },
  });

  const rawVirtualColumns = columnVirtualizer.getVirtualItems();
  const virtualColumns = useMemo(
    () =>
      rawVirtualColumns.map((item) => ({
        ...item,
        start: item.start - leftPinnedColumnsWidth,
        end: item.end - leftPinnedColumnsWidth,
      })),
    [rawVirtualColumns, leftPinnedColumnsWidth],
  );

  const virtualRows = rowVirtualizer.getVirtualItems();

  const measureGrid = useCallback(() => {
    Array.from(rowVirtualizer.elementsCache.values()).forEach((element) =>
      rowVirtualizer.measureElement(element),
    );
    columnVirtualizer.measure();
  }, [rowVirtualizer, columnVirtualizer]);

  return {
    virtualColumns,
    virtualRows,
    rowVirtualizer,
    columnVirtualizer,
    rowMeasureRef: rowVirtualizer.measureElement,
    measureGrid,
    virtualIndexAttributeName,
  };
};
