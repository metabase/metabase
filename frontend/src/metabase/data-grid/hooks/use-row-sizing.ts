import type { ColumnSizingState, RowData } from "@tanstack/react-table";
import { useCallback } from "react";

import { IMAGE_HEIGHT } from "../constants";
import type { ColumnOptions } from "../types";

type UseRowSizingProps<TData extends RowData, TValue> = {
  data: TData[];
  defaultRowHeight: number;
  columnSizingMap: ColumnSizingState;
  columnsOptions: ColumnOptions<TData, TValue>[];
  measureBodyCellDimensions: (
    text: React.ReactNode,
    width?: number,
  ) => { width: number; height: number };
};

export const useRowSizing = <TData extends RowData, TValue>({
  data,
  defaultRowHeight,
  columnSizingMap,
  columnsOptions,
  measureBodyCellDimensions,
}: UseRowSizingProps<TData, TValue>) => {
  const getRowHeight = useCallback(
    (index: number): number =>
      columnsOptions.reduce((max, column) => {
        const isWrap = column.wrap;
        const value = column.accessorFn(data[index]);
        const formatted = column.formatter
          ? column.formatter(value, index, column.id)
          : String(value);

        const isImg =
          formatted != null &&
          typeof formatted === "object" &&
          "type" in formatted &&
          formatted.type === "img";

        if (!isWrap && !isImg) {
          return max;
        }
        if (isImg) {
          return Math.max(IMAGE_HEIGHT, max);
        }

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
      columnsOptions,
      measureBodyCellDimensions,
    ],
  );

  return { getRowHeight };
};
