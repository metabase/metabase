import type { RowData, Table } from "@tanstack/react-table";
import { useCallback, useLayoutEffect, useRef } from "react";

import type { ColumnOptions } from "../../types";
import type { VirtualGrid } from "../use-virtual-grid";

import type { RowIndices, UseRowHeightsResult } from "./types";
import { getRowIndices } from "./utils";

type UseRowHeightsProps<TData extends RowData, TValue> = {
  data: TData[];
  defaultRowHeight: number;
  wrappedColumnsOptions: ColumnOptions<TData, TValue>[];
  measureBodyCellDimensions: (
    text: React.ReactNode,
    width?: number,
  ) => { width: number; height: number };
};

export const useRowHeights = <TData extends RowData, TValue>({
  data,
  defaultRowHeight,
  wrappedColumnsOptions,
  measureBodyCellDimensions,
}: UseRowHeightsProps<TData, TValue>): UseRowHeightsResult<TData> => {
  const tableRef = useRef<Table<TData>>();
  const virtualGridRef = useRef<VirtualGrid>();

  const rowHeightsCache = useRef<Map<number, number>>(new Map());
  const elementsByRowIndex = useRef<Map<number, Set<Element>>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

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

  const updateRowHeight = useCallback(
    (index: number): number => {
      const height = measureRowHeight(index);
      rowHeightsCache.current.set(index, height);
      return height;
    },
    [measureRowHeight],
  );

  const remeasureRow = useCallback(
    ({ index, virtualIndex }: RowIndices) => {
      if (index === null) {
        return;
      }
      const height = updateRowHeight(index);
      if (virtualIndex !== null) {
        virtualGridRef.current?.rowVirtualizer.resizeItem(virtualIndex, height);
      }
    },
    [updateRowHeight],
  );

  const recalculate = useCallback(
    (entries: ResizeObserverEntry[]) => {
      for (const { target } of entries) {
        const indices = getRowIndices(target);
        remeasureRow(indices);
      }
    },
    [remeasureRow],
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

  const watchElement = useCallback(
    (element: Element, { index }: RowIndices) => {
      if (index === null) {
        return;
      }
      const rowElements = elementsByRowIndex.current.get(index) ?? new Set();
      elementsByRowIndex.current.set(index, rowElements);
      if (!rowElements.has(element)) {
        rowElements.add(element);
        resizeObserverRef.current?.observe(element);
      }
    },
    [],
  );

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
    [remeasureRow, unwatchUnmountedElements, watchElement],
  );

  const remeasureAll = useCallback(() => {
    for (const elements of elementsByRowIndex.current.values()) {
      for (const element of elements) {
        const indices = getRowIndices(element);
        remeasureRow(indices);
      }
    }
  }, [remeasureRow]);

  useLayoutEffect(() => {
    resizeObserverRef.current = new ResizeObserver(recalculate);
    remountElements();

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [recalculate, remountElements]);

  return {
    tableRef,
    virtualGridRef,
    rowMeasureRef,
    getRowHeight,
    remeasureAll,
  };
};
