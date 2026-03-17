import type { Table } from "@tanstack/react-table";

import type { VirtualGrid } from "metabase/data-grid/hooks/use-virtual-grid";

export type UseRowHeightsResult<TData> = {
  tableRef: React.MutableRefObject<Table<TData> | undefined>;
  virtualGridRef: React.MutableRefObject<VirtualGrid | undefined>;
  rowMeasureRef: (element: HTMLDivElement | null) => void;
  getRowHeight: (rowIndex: number) => number;
  remeasureAll: () => void;
};

export type RowIndices = {
  index: number | null;
  virtualIndex: number | null;
};
