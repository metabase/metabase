import type { RowData, Table } from "@tanstack/react-table";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useUpdateEffect } from "react-use";

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
  measureRowHeight: (rowIndex: number) => number;
  pinnedRowMeasureRef: (element: HTMLDivElement | null) => void;
  centerRowMeasureRef: (element: HTMLDivElement | null) => void;
  pinnedTopRowHeights: number[];
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
  const [pinnedTopRowHeights, setPinnedTopRowHeights] = useState<number[]>([]);

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

  const pinnedRowsHeightsCache = useRef<Map<number, number>>(new Map());
  const pinnedResizeObserverRef = useRef<ResizeObserver | null>(null);
  const pinnedObservedElements = useRef<Set<HTMLElement>>(new Set());

  const updatePinnedHeight = useCallback((el: HTMLElement) => {
    const indexRaw = el.getAttribute("data-dataset-index");
    if (indexRaw == null) {
      return false;
    }
    const dataIndex = parseInt(indexRaw, 10);
    const height = el.offsetHeight;
    const prev = pinnedRowsHeightsCache.current.get(dataIndex);
    if (prev !== height) {
      pinnedRowsHeightsCache.current.set(dataIndex, height);
      return true;
    }
    return false;
  }, []);

  useLayoutEffect(() => {
    pinnedResizeObserverRef.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target;
        if (el instanceof HTMLElement && updatePinnedHeight(el)) {
          changed = true;
        }
      }
      if (changed) {
        virtualGridRef.current?.measureGrid();
      }
    });

    return () => {
      pinnedResizeObserverRef.current?.disconnect();
    };
  }, [virtualGridRef, updatePinnedHeight]);

  const pinnedRowMeasureRef = useCallback(
    (element: HTMLDivElement | null | undefined) => {
      if (!element) {
        return;
      }
      if (updatePinnedHeight(element)) {
        virtualGridRef.current?.measureGrid();
      }
      if (!pinnedObservedElements.current.has(element)) {
        pinnedObservedElements.current.add(element);
        pinnedResizeObserverRef.current?.observe(element);
      }
    },
    [virtualGridRef, updatePinnedHeight],
  );

  const centerRowMeasureRef = useCallback(
    (element: HTMLDivElement | null | undefined) =>
      virtualGridRef.current?.measureRow(element),
    [virtualGridRef],
  );

  useUpdateEffect(() => {
    const heights = Array.from({ length: pinnedTopRowsCount }, (_, i) =>
      measureRowHeight(i),
    );

    setPinnedTopRowHeights((prev) =>
      heights.length === prev.length &&
      heights.every((height, i) => height === prev[i])
        ? prev
        : heights,
    );
  }, [pinnedTopRowsCount, measureRowHeight]);

  return {
    tableRef,
    virtualGridRef,
    measureRowHeight,
    pinnedRowMeasureRef,
    centerRowMeasureRef,
    pinnedTopRowHeights,
  };
};
