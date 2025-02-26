import type {
  CellContext,
  ColumnDefTemplate,
  ColumnSizingState,
  HeaderContext,
  RowData,
  Table,
} from "@tanstack/react-table";
import type React from "react";
import type { MouseEventHandler, RefObject } from "react";

import type { ColumnsReordering } from "./hooks/use-columns-reordering";
import type { VirtualGrid } from "./hooks/use-virtual-grid";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    wrap?: boolean;
    enableReordering?: boolean;
    headerClickTargetSelector?: string;
  }
}

export type HeaderCellBaseProps = {
  name?: React.ReactNode;
  align?: CellAlign;
  sort?: "asc" | "desc";
};

export type BodyCellBaseProps<TValue> = {
  value: TValue;
  formatter?: CellFormatter<TValue>;
  backgroundColor?: string;
  align?: CellAlign;
  wrap?: boolean;
  canExpand?: boolean;
  columnId: string;
  rowIndex: number;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onExpand?: (id: string, formattedValue: React.ReactNode) => void;
};

export interface ColumnOptions<TRow extends RowData, TValue> {
  id: string;
  name: string;
  accessorFn: (row: TRow) => TValue;
  cell?: ColumnDefTemplate<CellContext<TRow, TValue>>;
  header?: ColumnDefTemplate<HeaderContext<TRow, TValue>>;
  cellVariant?: BodyCellVariant;
  getCellClassName?: (value: TValue, rowIndex: number) => string;
  headerVariant?: HeaderCellVariant;
  headerClickTargetSelector?: string;
  align?: CellAlign;
  wrap?: boolean;
  sortDirection?: "asc" | "desc";
  enableResizing?: boolean;
  getBackgroundColor?: (value: TValue, rowIndex: number) => string;
  formatter?: CellFormatter<TValue>;
}

export interface RowIdColumnOptions {
  variant: RowIdVariant;
  getBackgroundColor: (rowIndex: number) => string;
}

export interface TableOptions<TData, TValue> {
  data: TData[];
  columnOrder?: string[];
  columnSizing?: ColumnSizingState;
  defaultRowHeight?: number;
  rowId?: RowIdColumnOptions;
  truncateLongCellWidth?: number;
  columnsOptions: ColumnOptions<TData, TValue>[];
  onColumnResize?: (columnSizing: ColumnSizingState) => void;
  onColumnReorder?: (columnNames: string[]) => void;
}

export interface TableRefs {
  gridRef: RefObject<HTMLDivElement>;
}

export interface TableInstance<TData> {
  table: Table<TData>;
  refs: TableRefs;
  virtualGrid: VirtualGrid;
  measureRoot: React.ReactNode;
  columnsReordering: ColumnsReordering;
  measureColumnWidths: (updateCurrent?: boolean, truncate?: boolean) => void;
  onBodyCellClick?: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    rowIndex: number,
    columnId: string,
  ) => void;
  onHeaderCellClick?: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    columnId: string,
  ) => void;
  onAddColumnClick?: MouseEventHandler<HTMLButtonElement>;
  onScroll?: () => void;
}

export type ExpandedColumnsState = Record<string, boolean>;
export type CellAlign = "left" | "right" | "middle";
export type BodyCellVariant = "text" | "pill";
export type HeaderCellVariant = "light" | "outline";
export type RowIdVariant = "expandButton" | "indexOnly" | "indexExpand";
export type CellFormatter<TValue> = (
  value: TValue,
  rowIndex: number,
  columnId: string,
) => React.ReactNode;
