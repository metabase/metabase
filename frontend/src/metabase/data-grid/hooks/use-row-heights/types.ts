import type { Table } from "@tanstack/react-table";

import type { VirtualGrid } from "../use-virtual-grid";

export type RowSizingState = Map<number, number>;

export type UseRowHeightsResult<TData> = {
  tableRef: React.MutableRefObject<Table<TData> | undefined>;
  virtualGridRef: React.MutableRefObject<VirtualGrid | undefined>;
  rowMeasureRef: (element: HTMLDivElement | null) => void;
  getRowHeight: (rowIndex: number) => number;
  rowSizingMap: RowSizingState;
  remeasureAll: () => void;
};

export type RowIndices = {
  index: number | null;
  virtualIndex: number | null;
};
