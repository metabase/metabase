import type { Table as ReactTable } from "@tanstack/react-table";
import {
  type VirtualItem,
  type Virtualizer,
  useVirtualizer,
} from "@tanstack/react-virtual";
import type React from "react";
import { useCallback } from "react";

import type { HeightChangeEvent } from "./use-row-heights";

interface VirtualGridProps<TData> {
  gridRef: React.RefObject<HTMLDivElement>;
  table: ReactTable<TData>;
  defaultRowHeight: number;
  enableRowVirtualization?: boolean;
  onRowHeightChangeRef: React.MutableRefObject<
    ((event: HeightChangeEvent) => void) | undefined
  >;
  virtualIndexAttributeName: string;
}

export interface VirtualGrid {
  virtualColumns: VirtualItem[];
  virtualRows: VirtualItem[];
  virtualPaddingLeft: number;
  virtualPaddingRight: number;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  columnVirtualizer: Virtualizer<HTMLDivElement, Element>;
  measureGrid: () => void;
  virtualIndexAttributeName: string;
}

export const useVirtualGrid = <TData,>({
  gridRef,
  table,
  defaultRowHeight,
  enableRowVirtualization,
  onRowHeightChangeRef,
  virtualIndexAttributeName,
}: VirtualGridProps<TData>): VirtualGrid => {
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

  const rowVirtualizer = useVirtualizer({
    count: centerRows.length,
    indexAttribute: virtualIndexAttributeName,
    getScrollElement: () => gridRef.current,
    estimateSize: () => defaultRowHeight,
    overscan: 3,
    enabled: enableRowVirtualization,
  });

  onRowHeightChangeRef.current = ({ elements, height }: HeightChangeEvent) => {
    const element = elements?.values().next().value;
    if (!element) {
      return;
    }
    const virtualIndexRaw = element.getAttribute(virtualIndexAttributeName);
    const virtualIndex = virtualIndexRaw ? parseInt(virtualIndexRaw, 10) : null;
    if (virtualIndex === null) {
      return;
    }
    rowVirtualizer.resizeItem(virtualIndex, height);
  };

  const measureGrid = useCallback(() => {
    columnVirtualizer.measure();
  }, [columnVirtualizer]);

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
    virtualIndexAttributeName,
  };
};
