import type { Table } from "@tanstack/react-table";

export type RowSizingState = Map<number, number>;

export type UseRowHeightsResult<TData> = {
  tableRef: React.MutableRefObject<Table<TData> | undefined>;
  rowMeasureRef: (element: HTMLDivElement | null) => void;
  getRowHeight: (rowIndex: number) => number;
  rowSizingMap: RowSizingState;
  remeasureAll: () => void;
};

export type HeightChangeEvent = {
  index: number;
  height: number;
  elements: Set<Element> | undefined;
};
