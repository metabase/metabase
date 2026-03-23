import type { ColumnSizingState, RowData } from "@tanstack/react-table";
import { useCallback } from "react";

import type { ColumnOptions } from "../types";

type UseRowSizingProps<TData extends RowData, TValue> = {
  data: TData[];
  defaultRowHeight: number;
  columnSizingMap: ColumnSizingState;
  wrappedColumnsOptions: ColumnOptions<TData, TValue>[];
  measureBodyCellDimensions: (
    text: React.ReactNode,
    width?: number,
  ) => { width: number; height: number };
};

export const useRowSizing = <TData extends RowData, TValue>({
  data,
  defaultRowHeight,
  columnSizingMap,
  wrappedColumnsOptions,
  measureBodyCellDimensions,
}: UseRowSizingProps<TData, TValue>) => {
  const getRowHeight = useCallback(
    (index: number): number =>
      wrappedColumnsOptions.reduce((max, column) => {
        const value = column.accessorFn(data[index]);
        const formatted = column.formatter
          ? column.formatter(value, index, column.id)
          : String(value);

        if (value === null || value === undefined || formatted === "") {
          return max;
        }
        const width = columnSizingMap[column.id];
        try {
          const height = measureBodyCellDimensions(formatted, width).height;
          return Math.max(height, max);
        } catch {
          return max;
        }
      }, defaultRowHeight),
    [
      data,
      defaultRowHeight,
      columnSizingMap,
      wrappedColumnsOptions,
      measureBodyCellDimensions,
    ],
  );

  return { getRowHeight };
};
