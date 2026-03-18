import type { RowData, Table } from "@tanstack/react-table";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { ColumnOptions } from "../../types";

import type {
  HeightChangeEvent,
  RowSizingState,
  UseRowHeightsResult,
} from "./types";

type UseRowHeightsProps<TData extends RowData, TValue> = {
  data: TData[];
  defaultRowHeight: number;
  wrappedColumnsOptions: ColumnOptions<TData, TValue>[];
  measureBodyCellDimensions: (
    text: React.ReactNode,
    width?: number,
  ) => { width: number; height: number };
  datasetIndexAttributeName: string;
  onHeightChange?: (event: HeightChangeEvent) => void;
};

export const useRowHeights = <TData extends RowData, TValue>({
  data,
  defaultRowHeight,
  wrappedColumnsOptions,
  measureBodyCellDimensions,
  datasetIndexAttributeName,
  onHeightChange,
}: UseRowHeightsProps<TData, TValue>): UseRowHeightsResult<TData> => {
  const tableRef = useRef<Table<TData>>();
  const rowHeightsCache = useRef<RowSizingState>(new Map());
  const [rowSizingMap, setRowSizingMap] = useState<RowSizingState>(new Map());
  const flushRafRef = useRef<number | null>(null);
  const elementsByRowIndex = useRef<Map<number, Set<Element>>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const scheduleFlush = useCallback(() => {
    if (flushRafRef.current !== null) {
      return;
    }
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      setRowSizingMap(new Map(rowHeightsCache.current));
    });
  }, []);

  const measureRowHeight = useCallback(
    (index: number) => {
      if (wrappedColumnsOptions.length === 0) {
        return defaultRowHeight;
      }

      return Math.max(
        ...wrappedColumnsOptions.map((column) => {
          const value = column.accessorFn(data[index]);
          const formattedValue = column.formatter
            ? column.formatter(value, index, column.id)
            : String(value);

          if (value == null || formattedValue === "") {
            return defaultRowHeight;
          }
          const tableColumn = tableRef.current?.getColumn(column.id);

          const cellDimensions = measureBodyCellDimensions(
            formattedValue,
            tableColumn?.getSize(),
          );
          return cellDimensions.height;
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
    (index: number): number =>
      rowHeightsCache.current.get(index) ?? defaultRowHeight,
    [defaultRowHeight],
  );

  const getRowIndices = useCallback(
    (element: Element): number | null => {
      const indexRaw = element.getAttribute(datasetIndexAttributeName);
      return indexRaw ? parseInt(indexRaw, 10) : null;
    },
    [datasetIndexAttributeName],
  );

  const updateRowHeight = useCallback(
    (index: number): number => {
      const height = measureRowHeight(index);
      const prev = rowHeightsCache.current.get(index);
      rowHeightsCache.current.set(index, height);
      if (prev !== height) {
        scheduleFlush();
      }
      return height;
    },
    [measureRowHeight, scheduleFlush],
  );

  const remeasureRow = useCallback(
    (index: number | null) => {
      if (index === null) {
        return;
      }
      const height = updateRowHeight(index);
      const elements = elementsByRowIndex.current.get(index);
      onHeightChange?.({ index, height, elements });
    },
    [updateRowHeight, onHeightChange],
  );

  const recalculate = useCallback(
    (entries: ResizeObserverEntry[]) => {
      for (const { target } of entries) {
        const indices = getRowIndices(target);
        remeasureRow(indices);
      }
    },
    [remeasureRow, getRowIndices],
  );

  const remountElements = useCallback(() => {
    for (const elements of elementsByRowIndex.current.values()) {
      for (const el of elements) {
        if (el.isConnected) {
          resizeObserverRef.current?.observe(el);
        }
      }
    }
  }, []);

  const unwatchUnmountedElements = useCallback(() => {
    for (const [index, elements] of elementsByRowIndex.current) {
      for (const el of elements) {
        if (!el.isConnected) {
          resizeObserverRef.current?.unobserve(el);
          elements.delete(el);
        }
      }
      if (elements.size === 0) {
        elementsByRowIndex.current.delete(index);
      }
    }
  }, []);

  const watchElement = useCallback((element: Element, index: number | null) => {
    if (index === null) {
      return;
    }
    const rowElements = elementsByRowIndex.current.get(index) ?? new Set();
    elementsByRowIndex.current.set(index, rowElements);
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
      const indices = getRowIndices(element);
      watchElement(element, indices);
      remeasureRow(indices);
    },
    [remeasureRow, unwatchUnmountedElements, watchElement, getRowIndices],
  );

  const remeasureAll = useCallback(() => {
    for (const elements of elementsByRowIndex.current.values()) {
      for (const element of elements) {
        const indices = getRowIndices(element);
        remeasureRow(indices);
      }
    }
  }, [remeasureRow, getRowIndices]);

  useLayoutEffect(() => {
    resizeObserverRef.current = new ResizeObserver(recalculate);
    remountElements();
    return () => {
      resizeObserverRef.current?.disconnect();
      if (flushRafRef.current !== null) {
        cancelAnimationFrame(flushRafRef.current);
      }
    };
  }, [recalculate, remountElements]);

  return {
    tableRef,
    rowSizingMap,
    rowMeasureRef,
    getRowHeight,
    remeasureAll,
  };
};
