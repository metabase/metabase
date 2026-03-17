import type { RowData, Table } from "@tanstack/react-table";
import { useCallback, useLayoutEffect, useRef } from "react";

import type { ColumnOptions } from "../types";

import type { VirtualGrid } from "./use-virtual-grid";

type UseRowHeightsProps<TData extends RowData, TValue> = {
  data: TData[];
  defaultRowHeight: number;
  wrappedColumnsOptions: ColumnOptions<TData, TValue>[];
  measureBodyCellDimensions: (
    text: React.ReactNode,
    width?: number,
  ) => { width: number; height: number };
  pinnedTopRowsCount: number;
};

type UseRowHeightsResult<TData> = {
  tableRef: React.MutableRefObject<Table<TData> | undefined>;
  virtualGridRef: React.MutableRefObject<VirtualGrid | undefined>;
  rowMeasureRef: (element: HTMLDivElement | null) => void;
  getRowHeight: (rowIndex: number) => number;
  remeasureAll: () => void;
};

export const useRowHeights = <TData extends RowData, TValue>({
  data,
  defaultRowHeight,
  wrappedColumnsOptions,
  measureBodyCellDimensions,
  pinnedTopRowsCount,
}: UseRowHeightsProps<TData, TValue>): UseRowHeightsResult<TData> => {
  const tableRef = useRef<Table<TData>>();
  const virtualGridRef = useRef<VirtualGrid>();

  const rowHeightsCache = useRef<Map<number, number>>(new Map());
  const elementsByRow = useRef<Map<number, Set<Element>>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const measureRowHeight = useCallback(
    (rowIndex: number) => {
      if (wrappedColumnsOptions.length === 0) {
        return defaultRowHeight;
      }

      return Math.max(
        ...wrappedColumnsOptions.map((column) => {
          const value = column.accessorFn(data[rowIndex]);
          const formattedValue = column.formatter
            ? column.formatter(value, rowIndex, column.id)
            : String(value);

          if (value == null || formattedValue === "") {
            return defaultRowHeight;
          }
          const tableColumn = tableRef.current?.getColumn(column.id);

          try {
            const cellDimensions = measureBodyCellDimensions(
              formattedValue,
              tableColumn?.getSize(),
            );
            return cellDimensions.height;
          } catch {
            return defaultRowHeight;
          }
        }),
        defaultRowHeight,
      );
    },
    [
      data,
      defaultRowHeight,
      measureBodyCellDimensions,
      tableRef,
      wrappedColumnsOptions,
    ],
  );

  const getRowHeight = useCallback(
    (rowIndex: number): number =>
      rowHeightsCache.current.get(rowIndex) ?? defaultRowHeight,
    [defaultRowHeight],
  );

  const getRowIndex = useCallback((element: Element): number | null => {
    const indexRaw = element.getAttribute("data-dataset-index");
    if (!indexRaw) {
      return null;
    }
    return parseInt(indexRaw, 10);
  }, []);

  const updateRowHeight = useCallback(
    (rowIndex: number): number => {
      const height = measureRowHeight(rowIndex);
      rowHeightsCache.current.set(rowIndex, height);
      return height;
    },
    [measureRowHeight],
  );

  const remeasureRow = useCallback(
    (rowIndex: number) => {
      const height = updateRowHeight(rowIndex);
      const isVirtual = rowIndex >= pinnedTopRowsCount;

      if (isVirtual) {
        const virtualIndex = rowIndex - pinnedTopRowsCount;
        virtualGridRef.current?.rowVirtualizer.resizeItem(virtualIndex, height);
      }
    },
    [updateRowHeight, pinnedTopRowsCount],
  );

  const recalculate = useCallback(
    (entries: ResizeObserverEntry[]) => {
      for (const entry of entries) {
        const element = entry.target;
        const rowIndex = getRowIndex(element);
        if (rowIndex === null) {
          continue;
        }
        remeasureRow(rowIndex);
      }
    },
    [getRowIndex, remeasureRow],
  );

  useLayoutEffect(() => {
    resizeObserverRef.current = new ResizeObserver(recalculate);
    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [recalculate]);

  const unwatchUnmountedElements = useCallback(() => {
    for (const [rowIndex, elements] of elementsByRow.current) {
      for (const el of elements) {
        if (!el.isConnected) {
          resizeObserverRef.current?.unobserve(el);
          elements.delete(el);
        }
      }
      if (elements.size === 0) {
        elementsByRow.current.delete(rowIndex);
      }
    }
  }, []);

  const watchElement = useCallback((element: Element, rowIndex: number) => {
    const rowElements = elementsByRow.current.get(rowIndex) ?? new Set();
    elementsByRow.current.set(rowIndex, rowElements);
    if (!rowElements.has(element)) {
      rowElements.add(element);
      resizeObserverRef.current?.observe(element);
    }
  }, []);

  const rowMeasureRef = useCallback(
    (element: Element | null) => {
      if (!element) {
        unwatchUnmountedElements();
        return;
      }
      const rowIndex = getRowIndex(element);
      if (rowIndex === null) {
        return;
      }
      watchElement(element, rowIndex);
      remeasureRow(rowIndex);
    },
    [remeasureRow, unwatchUnmountedElements, getRowIndex, watchElement],
  );

  const remeasureAll = useCallback(() => {
    for (const [rowIndex] of elementsByRow.current) {
      remeasureRow(rowIndex);
    }
  }, [remeasureRow]);

  return {
    tableRef,
    virtualGridRef,
    rowMeasureRef,
    getRowHeight,
    remeasureAll,
  };
};
