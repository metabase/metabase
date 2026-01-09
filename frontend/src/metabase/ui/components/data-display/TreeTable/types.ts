import type {
  ColumnDef,
  ExpandedState,
  FilterFn,
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  Table,
} from "@tanstack/react-table";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from "react";

/**
 * Base interface that all tree node data must extend.
 * IDs can be strings or numbers - getNodeId converts them to strings for TanStack Table.
 */
export interface TreeNodeData {
  id: string | number;
}

/**
 * Column sizing extensions for TreeTable.
 */
export interface TreeTableColumnSizingDef {
  /** Column ID is required for TreeTable columns. */
  id: string;
  /** Fixed width in pixels, or 'auto' (measures content via DOM) */
  width?: number | "auto";
  /** Minimum width: pixels or 'auto' (measures content via DOM). */
  minWidth?: number | "auto";
  /** Maximum width in pixels. Only applies to stretching columns. */
  maxWidth?: number;
  /** Extra pixels added to measured width. Only applies when width or minWidth is 'auto'. */
  widthPadding?: number;
}

/**
 * Column definition for TreeTable.
 * Extends TanStack Table's ColumnDef with tree-specific sizing options.
 * Requires `id` to be specified on all columns.
 */
export type TreeTableColumnDef<TData extends TreeNodeData> = ColumnDef<
  TData,
  unknown
> &
  TreeTableColumnSizingDef;

/**
 * Options for useTreeTableInstance hook.
 */
export interface UseTreeTableInstanceOptions<TData extends TreeNodeData> {
  data: TData[];
  columns: TreeTableColumnDef<TData>[];
  getNodeId: (node: TData) => string;

  getSubRows?: (node: TData) => TData[] | undefined;
  getRowCanExpand?: (row: Row<TData>) => boolean;

  expanded?: ExpandedState;
  onExpandedChange?: OnChangeFn<ExpandedState>;
  defaultExpanded?: ExpandedState | true;
  autoExpandSingleChild?: boolean;

  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  enableMultiRowSelection?: boolean;
  enableSubRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  enableSorting?: boolean;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;

  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  globalFilterFn?: FilterFn<TData>;
  /**
   * Determines which nodes should be filtered. Return true for leaf nodes
   * that should be searchable, false for parent/collection nodes.
   * Parents returning false will only appear if children match the filter.
   */
  isFilterable?: (node: TData) => boolean;

  defaultRowHeight?: number;
  overscan?: number;

  /**
   * Called when Enter is pressed on a non-expandable row.
   * Use this to navigate to the item or perform the primary action.
   */
  onRowActivate?: (row: Row<TData>) => void;

  /**
   * ID of the currently selected row.
   * Independent from keyboard navigation focus.
   */
  selectedRowId?: string | null;
}

/**
 * Column sizing state and controls.
 */
export interface TreeTableColumnSizing {
  columnWidths: Record<string, number>;
  setContainerWidth: (width: number) => void;
  isMeasured: boolean;
}

/**
 * Instance returned by useTreeTableInstance.
 */
export interface TreeTableInstance<TData extends TreeNodeData> {
  table: Table<TData>;

  rows: Row<TData>[];

  virtualizer: Virtualizer<HTMLDivElement, Element>;
  containerRef: RefObject<HTMLDivElement>;
  virtualRows: VirtualItem[];
  totalSize: number;

  columnWidths: Record<string, number>;
  isMeasured: boolean;
  setContainerWidth: (width: number) => void;

  scrollToRow: (
    rowId: string,
    options?: { align?: "start" | "center" | "end" | "auto" },
  ) => void;
  scrollToNode: (nodeId: string) => void;

  activeRowId: string | null;
  setActiveRowId: (id: string | null) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;

  selectedRowId: string | null;
}

export type TreeTableStylesNames =
  | "root"
  | "header"
  | "headerRow"
  | "headerCell"
  | "body"
  | "row"
  | "rowActive"
  | "rowDisabled"
  | "cell"
  | "treeCell"
  | "treeCellContent"
  | "expandButton"
  | "checkbox";

export type TreeTableHeaderVariant = "pill" | "plain";

/**
 * Selection state for tri-state checkboxes.
 */
export type SelectionState = "all" | "some" | "none";

export interface TreeTableStylesProps {
  classNames?: Partial<Record<TreeTableStylesNames, string>>;
  styles?: Partial<Record<TreeTableStylesNames, CSSProperties>>;
}

/**
 * Props for TreeTable component.
 */
export interface TreeTableProps<TData extends TreeNodeData>
  extends TreeTableStylesProps {
  instance: TreeTableInstance<TData>;

  showCheckboxes?: boolean;
  indentWidth?: number;
  headerVariant?: TreeTableHeaderVariant;

  emptyState?: ReactNode;

  onRowClick?: (row: Row<TData>, event: MouseEvent) => void;
  onRowDoubleClick?: (row: Row<TData>, event: MouseEvent) => void;

  /**
   * Custom selection state callback. When provided, bypasses TanStack selection
   * and uses this to determine checkbox state for each row.
   */
  getSelectionState?: (row: Row<TData>) => SelectionState;

  /**
   * Custom checkbox click handler. When provided, called instead of
   * row.toggleSelected(). Receives row, visible index, and MouseEvent
   * (for detecting shift+click).
   */
  onCheckboxClick?: (row: Row<TData>, index: number, event: MouseEvent) => void;

  /**
   * Callback to determine if a row's children are currently loading.
   * When true, shows a loading spinner instead of expand button.
   */
  isChildrenLoading?: (row: Row<TData>) => boolean;

  /**
   * Callback to determine if a row is disabled.
   * Disabled rows have pointer-events: none and reduced opacity.
   */
  isRowDisabled?: (row: Row<TData>) => boolean;

  /**
   * Callback to get additional props for each row element.
   * Useful for adding test IDs or custom data attributes.
   */
  getRowProps?: (row: Row<TData>) => Record<string, unknown>;

  ariaLabel?: string;
  ariaLabelledBy?: string;
}

/**
 * Props for TreeTableRow component.
 */
export interface TreeTableRowProps<TData extends TreeNodeData>
  extends TreeTableStylesProps {
  row: Row<TData>;
  rowIndex: number;
  virtualItem: VirtualItem;
  table: Table<TData>;
  columnWidths: Record<string, number>;
  showCheckboxes: boolean;
  showExpandButtons: boolean;
  indentWidth: number;
  activeRowId: string | null;
  selectedRowId?: string | null;
  isExpanded: boolean;
  canExpand: boolean;
  measureElement: (element: HTMLElement | null) => void;
  onRowClick?: (row: Row<TData>, event: MouseEvent) => void;
  onRowDoubleClick?: (row: Row<TData>, event: MouseEvent) => void;
  isDisabled?: boolean;
  isChildrenLoading?: boolean;
  getSelectionState?: (row: Row<TData>) => SelectionState;
  onCheckboxClick?: (row: Row<TData>, index: number, event: MouseEvent) => void;
  getRowProps?: (row: Row<TData>) => Record<string, unknown>;
}

/**
 * Props for TreeTableHeader component.
 */
export interface TreeTableHeaderProps<TData extends TreeNodeData>
  extends TreeTableStylesProps {
  table: Table<TData>;
  columnWidths: Record<string, number>;
  showCheckboxes: boolean;
  isMeasured?: boolean;
  totalContentWidth?: number;
  headerVariant?: TreeTableHeaderVariant;
}

/**
 * Props for ExpandButton component.
 */
export interface ExpandButtonProps {
  canExpand: boolean;
  isExpanded: boolean;
  isLoading?: boolean;
  onClick: (event: MouseEvent) => void;
  className?: string;
}

/**
 * Props for SelectionCheckbox component.
 */
export interface SelectionCheckboxProps {
  isSelected: boolean;
  isSomeSelected: boolean;
  disabled?: boolean;
  onClick: (event: MouseEvent) => void;
  className?: string;
}
