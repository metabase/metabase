import type { RowData, Table } from "@tanstack/react-table";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ColumnOptions } from "metabase/data-grid/types";

type UseRowHeightsProps<TData extends RowData, TValue> = {
  data: TData[];
  tableRef: React.MutableRefObject<Table<TData> | undefined>;
  defaultRowHeight: number;
  wrappedColumnsOptions: ColumnOptions<TData, TValue>[];
  measureBodyCellDimensions: (
    text: React.ReactNode,
    width?: number,
  ) => { width: number; height: number };
  pinnedTopRowsCount: number;
  gridRef: React.RefObject<HTMLDivElement>;
  measureGridRef: React.MutableRefObject<(() => void) | undefined>;
};

type UseRowHeightsResult = {
  measureRowHeight: (rowIndex: number) => number;
  pinnedMeasureRef: (element: HTMLElement | null) => void;
  pinnedCandidateRowHeights: number[];
};

export const useRowHeights = <TData extends RowData, TValue>({
  data,
  tableRef,
  defaultRowHeight,
  wrappedColumnsOptions,
  measureBodyCellDimensions,
  pinnedTopRowsCount,
  gridRef,
  measureGridRef,
}: UseRowHeightsProps<TData, TValue>): UseRowHeightsResult => {
  const [pinnedCandidateRowHeights, setPinnedCandidateRowHeights] = useState<
    number[]
  >([]);

  const measureRowHeight = useCallback(
    (rowIndex: number) => {
      if (wrappedColumnsOptions.length === 0) {
        return defaultRowHeight;
      }

      const height = Math.max(
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

      return height;
    },
    [
      data,
      defaultRowHeight,
      measureBodyCellDimensions,
      tableRef,
      wrappedColumnsOptions,
    ],
  );

  const pinnedSideHeights = useRef<Map<number, number>>(new Map());

  const pinnedMeasureRef = useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return;
      }
      const indexRaw = element.getAttribute("data-dataset-index");
      if (indexRaw == null) {
        return;
      }
      const dataIndex = parseInt(indexRaw, 10);
      const height = element.offsetHeight;
      const prev = pinnedSideHeights.current.get(dataIndex);
      if (prev !== height) {
        pinnedSideHeights.current.set(dataIndex, height);
        measureGridRef.current?.();
      }
    },
    [measureGridRef],
  );

  const pinnedResizeObserverRef = useRef<ResizeObserver | null>(null);
  const pinnedObservedElements = useRef<Set<HTMLElement>>(new Set());

  useLayoutEffect(() => {
    pinnedResizeObserverRef.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target;
        if (!(el instanceof HTMLElement)) {
          continue;
        }
        const indexRaw = el.getAttribute("data-dataset-index");
        if (indexRaw == null) {
          continue;
        }
        const dataIndex = parseInt(indexRaw, 10);
        const height = el.offsetHeight;
        const prev = pinnedSideHeights.current.get(dataIndex);
        if (prev !== height) {
          pinnedSideHeights.current.set(dataIndex, height);
          changed = true;
        }
      }
      if (changed) {
        measureGridRef.current?.();
      }
    });

    return () => {
      pinnedResizeObserverRef.current?.disconnect();
    };
  }, [measureGridRef]);

  const pinnedMeasureRefWithObserver = useCallback(
    (element: HTMLElement | null) => {
      if (element) {
        pinnedMeasureRef(element);
        if (!pinnedObservedElements.current.has(element)) {
          pinnedObservedElements.current.add(element);
          pinnedResizeObserverRef.current?.observe(element);
        }
      }
    },
    [pinnedMeasureRef],
  );

  useEffect(() => {
    if (!gridRef.current) {
      return;
    }
    const heights = Array.from({ length: pinnedTopRowsCount }, (_, i) =>
      measureRowHeight(i),
    );

    setPinnedCandidateRowHeights((prev) =>
      heights.length === prev.length &&
      heights.every((height, i) => height === prev[i])
        ? prev
        : heights,
    );
  }, [pinnedTopRowsCount, measureRowHeight, gridRef]);

  return {
    measureRowHeight,
    pinnedMeasureRef: pinnedMeasureRefWithObserver,
    pinnedCandidateRowHeights,
  };
};
