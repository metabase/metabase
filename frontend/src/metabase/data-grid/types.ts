import type {
  CellContext,
  ColumnDefTemplate,
  ColumnSizingState,
  HeaderContext,
  RowData,
  Table,
} from "@tanstack/react-table";
import type React from "react";
import type { RefObject } from "react";

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
  style?: React.CSSProperties;
  onExpand?: (id: string, formattedValue: React.ReactNode) => void;
};

/**
 * Configuration options for a table column
 * @template TRow The type of the row data
 * @template TValue The type of the value in this column
 */
export interface ColumnOptions<TRow extends RowData, TValue = unknown> {
  /** Unique identifier for the column */
  id: string;

  /** Display name for the column header */
  name: string;

  /** Function to extract the cell value from a row */
  accessorFn: (row: TRow) => TValue;

  /** Custom cell render template */
  cell?: ColumnDefTemplate<CellContext<TRow, TValue>>;

  /** Custom header render template */
  header?: ColumnDefTemplate<HeaderContext<TRow, TValue>>;

  /** Visual style of the body cells */
  cellVariant?: BodyCellVariant;

  /** Function to determine CSS class names for cells */
  getCellClassName?: (value: TValue, rowIndex: number) => string;

  /** Function to determine CSS styles for cells */
  getCellStyle?: (value: TValue, rowIndex: number) => React.CSSProperties;

  /** Visual style of the header cell */
  headerVariant?: HeaderCellVariant;

  /** CSS selector for the clickable area in header */
  headerClickTargetSelector?: string;

  /** Text alignment within cells */
  align?: CellAlign;

  /** Whether text should wrap in this column */
  wrap?: boolean;

  /** Initial sort direction for this column */
  sortDirection?: "asc" | "desc";

  /** Whether this column can be resized */
  enableResizing?: boolean;

  /** Function to determine background color for cells */
  getBackgroundColor?: (value: TValue, rowIndex: number) => string;

  /** Function to format cell values for display */
  formatter?: CellFormatter<TValue>;
}

/**
 * Configuration for the row ID column
 */
export interface RowIdColumnOptions {
  /** Display style of the row ID column */
  variant: RowIdVariant;

  /** Function to determine background color for the ID cells */
  getBackgroundColor?: (rowIndex: number) => string;
}

export interface DataGridTheme {
  /** Table font size, defaults to ~12.5px */
  fontSize?: string;

  cell?: {
    /** Text color default body cells, defaults to `text-primary`. */
    textColor?: string;

    /** Default background color of cells, defaults to `background` */
    backgroundColor?: string;
  };

  pillCell?: {
    /** Text color of pill cell, defaults to `brand`. */
    textColor?: string;

    /** Pill background color of ID column, defaults to `lighten(brand)`  */
    backgroundColor?: string;
  };
}

/**
 * Configuration options for the table
 */
export interface DataGridOptions<TData = any, TValue = any> {
  /** Array of data to display in the table */
  data: TData[];

  /** Order of columns by ID */
  columnOrder?: string[];

  /** Width of each column by ID */
  columnSizingMap?: ColumnSizingState;

  /** Default row height in pixels */
  defaultRowHeight?: number;

  /** Configuration for columns */
  columnsOptions: ColumnOptions<TData, TValue>[];

  /** Row ID accessor and display options */
  rowId?: RowIdColumnOptions;

  /** Width in pixels at which to truncate long cell content */
  truncateLongCellWidth?: number;

  /** Data grid theme */
  theme?: DataGridTheme;

  /** Callback when a column is resized */
  onColumnResize?: (columnSizingMap: ColumnSizingState) => void;

  /** Callback when columns are reordered */
  onColumnReorder?: (columnOrder: string[]) => void;

  /**
   * Custom render function to wrap content during measurement, applied on top of the default
   * EmotionCacheProvider and ThemeProvider. Use this to add your own custom context providers
   * that affect rendering or styling of the measured content.
   */
  measurementRenderWrapper?: (
    children: React.ReactElement,
  ) => React.ReactElement;
}

export type CellAlign = "left" | "middle" | "right";
export type BodyCellVariant = "text" | "pill";
export type HeaderCellVariant = "light" | "outline";
export type RowIdVariant = "indexExpand" | "expandButton";

export type CellFormatter<TValue> = (
  value: TValue,
  rowIndex: number,
  columnId: string,
) => React.ReactNode;

export type ExpandedColumnsState = Record<string, boolean>;

export interface DataGridInstance<TData> {
  table: Table<TData>;
  gridRef: RefObject<HTMLDivElement>;
  virtualGrid: VirtualGrid;
  measureRoot: React.ReactNode;
  columnsReordering: ColumnsReordering;
  measureColumnWidths: () => void;
  onHeaderCellClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    columnId?: string,
  ) => void;
  onBodyCellClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    rowIndex: number,
    columnId: string,
  ) => void;
  onAddColumnClick?: React.MouseEventHandler<HTMLButtonElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}
