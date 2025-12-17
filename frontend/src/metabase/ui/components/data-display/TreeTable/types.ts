import type {
  Column,
  ExpandedState,
  FilterFn,
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingFn,
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
 * Cell render props - provides access to TanStack Row and value accessor.
 */
export interface TreeTableCellProps<TData extends TreeNodeData> {
  row: Row<TData>;
  getValue: () => unknown;
}

/**
 * Header render props - provides access to column sorting state.
 */
export interface TreeTableColumnHeaderProps<TData extends TreeNodeData> {
  column: Column<TData>;
  table: Table<TData>;
  isSorted: false | "asc" | "desc";
}

/**
 * Column definition for TreeTable.
 * Closely maps to TanStack Table ColumnDef with tree-specific additions.
 */
export interface TreeTableColumnDef<TData extends TreeNodeData> {
  id: string;
  header?:
    | ReactNode
    | ((props: TreeTableColumnHeaderProps<TData>) => ReactNode);
  cell?: (props: TreeTableCellProps<TData>) => ReactNode;
  accessorKey?: keyof TData & string;
  accessorFn?: (row: TData) => unknown;

  /** Fixed width in pixels. Column does NOT stretch. */
  width?: number;
  /** Minimum width: pixels or 'auto' (measures content via DOM). */
  minWidth?: number | "auto";
  /** Maximum width in pixels. Only applies to stretching columns. */
  maxWidth?: number;

  enableSorting?: boolean;
  sortingFn?:
    | "alphanumeric"
    | "alphanumericCaseSensitive"
    | "text"
    | "textCaseSensitive"
    | "datetime"
    | "basic"
    | SortingFn<TData>;
  sortDescFirst?: boolean;
  sortUndefined?: "first" | "last" | false | -1 | 1;

  enableFiltering?: boolean;
  filterFn?: "includesString" | "includesStringSensitive" | FilterFn<TData>;
}

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
  measureElement: (element: HTMLElement | null) => void;
  onRowClick?: (row: Row<TData>, event: MouseEvent) => void;
  onRowDoubleClick?: (row: Row<TData>, event: MouseEvent) => void;
  isDisabled?: boolean;
  isChildrenLoading?: boolean;
  getSelectionState?: (row: Row<TData>) => SelectionState;
  onCheckboxClick?: (row: Row<TData>, index: number, event: MouseEvent) => void;
}

/**
 * Props for TreeTableHeader component.
 */
export interface TreeTableHeaderProps<TData extends TreeNodeData>
  extends TreeTableStylesProps {
  table: Table<TData>;
  columnWidths: Record<string, number>;
  showCheckboxes: boolean;
  scrollRef?: RefObject<HTMLDivElement>;
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
