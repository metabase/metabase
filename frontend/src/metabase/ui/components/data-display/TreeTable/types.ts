import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from "react";

// ============================================================================
// Core Tree Types
// ============================================================================

/** Unique identifier for tree nodes */
export type NodeId = string | number;

/** Base interface that all tree node data must extend */
export interface TreeNodeData {
  id: NodeId;
}

/**
 * Flattened representation of a tree node for rendering.
 * Created by useTreeFlatten from hierarchical data.
 */
export interface FlatTreeNode<TData extends TreeNodeData> {
  /** Original node data */
  data: TData;
  /** Unique node identifier */
  id: NodeId;
  /** Nesting level (0 for root nodes) */
  depth: number;
  /** Position in flattened array */
  index: number;
  /** Parent node ID (null for root nodes) */
  parentId: NodeId | null;
  /** Whether node can be expanded */
  hasChildren: boolean;
  /** Current expansion state */
  isExpanded: boolean;
  /** Whether children are being loaded */
  isLoading?: boolean;
  /** Whether node is non-interactive */
  isDisabled?: boolean;
}

/** Tri-state selection: none, partial (some children), or all */
export type SelectionState = "none" | "some" | "all";

export type SortDirection = "asc" | "desc";

export interface SortingState {
  columnId: string;
  direction: SortDirection;
}

// ============================================================================
// Column Definition
// ============================================================================

export type SortingFn<TData> =
  | "alphanumeric"
  | "datetime"
  | "numeric"
  | ((a: TData, b: TData, direction: SortDirection) => number);

/** Column definition for TreeTable */
export interface TreeColumnDef<TData extends TreeNodeData> {
  /** Unique column identifier */
  id: string;
  /** Column header content or render function */
  header?: ReactNode | ((props: TreeColumnHeaderProps) => ReactNode);
  /** Custom cell renderer (receives node and extracted value) */
  cell?: (props: TreeCellProps<TData>) => ReactNode;
  /** Key to access value from node data */
  accessorKey?: keyof TData;
  /** Function to extract value from node data */
  accessorFn?: (data: TData) => unknown;
  /** Fixed column width in pixels */
  size?: number;
  /** Minimum column width in pixels */
  minSize?: number;
  /** Whether column should grow to fill available space */
  grow?: boolean;
  /** Enable sorting for this column */
  enableSorting?: boolean;
  /** Sorting function: built-in name or custom comparator */
  sortingFn?: SortingFn<TData>;
}

export interface TreeColumnHeaderProps {
  sorting: SortingState | null;
  isSorted: boolean;
  sortDirection: SortDirection | null;
}

/** Props passed to custom cell renderers */
export interface TreeCellProps<TData extends TreeNodeData> {
  node: FlatTreeNode<TData>;
  value: unknown;
}

// ============================================================================
// Hook Options
// ============================================================================

/** Core options for useTreeTable hook */
export interface TreeTableOptions<TData extends TreeNodeData> {
  data: TData[];
  columns: TreeColumnDef<TData>[];
  getChildren: (node: TData) => TData[] | undefined | null;
  getNodeId: (node: TData) => NodeId;
  /** Override hasChildren detection for lazy-loaded nodes */
  isExpandable?: (node: TData) => boolean;
  isDisabled?: (node: TData) => boolean;
  defaultRowHeight?: number;
  overscan?: number;
}

export interface ExpansionOptions {
  expandedIds?: Set<NodeId>;
  onExpandedChange?: (expandedIds: Set<NodeId>) => void;
  defaultExpandedIds?: Set<NodeId>;
  autoExpandSingleChild?: boolean;
}

export interface SelectionOptions {
  selectionMode?: "none" | "single" | "multi";
  selectedIds?: Set<NodeId>;
  onSelectionChange?: (selectedIds: Set<NodeId>) => void;
  initialSelectedIds?: Set<NodeId>;
  enableRangeSelection?: boolean;
}

export interface LazyLoadingOptions<TData extends TreeNodeData> {
  onLoadChildren?: (node: TData) => Promise<TData[]>;
  loadingIds?: Set<NodeId>;
  hasUnloadedChildren?: (node: TData) => boolean;
}

export interface SortingOptions {
  sorting?: SortingState | null;
  onSortingChange?: (sorting: SortingState | null) => void;
  manualSorting?: boolean;
}

export interface KeyboardNavOptions {
  enableKeyboardNav?: boolean;
  activeId?: NodeId | null;
  onActiveChange?: (id: NodeId | null) => void;
}

// ============================================================================
// Hook Return Types
// ============================================================================

/** Expansion state and controls returned by useTreeExpansion */
export interface TreeExpansion {
  /** Set of currently expanded node IDs */
  expandedIds: Set<NodeId>;
  /** Check if a node is expanded */
  isExpanded: (id: NodeId) => boolean;
  /** Expand a single node */
  expand: (id: NodeId) => void;
  /** Collapse a single node */
  collapse: (id: NodeId) => void;
  /** Toggle expansion state of a node */
  toggle: (id: NodeId) => void;
  /** Expand all nodes in the tree */
  expandAll: () => void;
  /** Collapse all nodes */
  collapseAll: () => void;
  /** Replace all expanded IDs */
  setExpandedIds: (ids: Set<NodeId>) => void;
}

/** Selection state and controls returned by useTreeSelection */
export interface TreeSelection<TData extends TreeNodeData> {
  /** Set of currently selected node IDs */
  selectedIds: Set<NodeId>;
  /** Current selection mode */
  selectionMode: "none" | "single" | "multi";
  /** Check if a node is selected */
  isSelected: (id: NodeId) => boolean;
  /** Get tri-state selection for checkbox display */
  getSelectionState: (node: FlatTreeNode<TData>) => SelectionState;
  /** Select a single node */
  select: (id: NodeId) => void;
  /** Deselect a single node */
  deselect: (id: NodeId) => void;
  /** Toggle selection (handles parent/child cascading in multi mode) */
  toggle: (id: NodeId, event?: MouseEvent) => void;
  /** Select range of nodes by index (for shift+click) */
  selectRange: (fromIndex: number, toIndex: number) => void;
  /** Select all leaf nodes */
  selectAll: () => void;
  /** Clear all selections */
  deselectAll: () => void;
}

/** Sorting state and controls returned by useTreeSorting */
export interface TreeSorting<TData extends TreeNodeData> {
  /** Current sorting state (null if unsorted) */
  sorting: SortingState | null;
  /** Check if a column is currently sorted */
  isSorted: (columnId: string) => boolean;
  /** Get sort direction for a column */
  getSortDirection: (columnId: string) => SortDirection | null;
  /** Cycle sort: asc → desc → none */
  toggleSort: (columnId: string) => void;
  /** Set specific sort direction */
  setSort: (columnId: string, direction: SortDirection) => void;
  /** Remove sorting */
  clearSort: () => void;
  /** Apply current sort to data (recursively sorts children) */
  sortData: (data: TData[]) => TData[];
}

/** Virtualization state and controls returned by useTreeVirtualization */
export interface TreeVirtualization {
  /** Ref to attach to scrollable container */
  containerRef: RefObject<HTMLDivElement>;
  /** Underlying virtualizer instance from @tanstack/react-virtual */
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** Currently visible virtual items */
  virtualItems: VirtualItem[];
  /** Total height of all rows (for scroll container) */
  totalSize: number;
  /** Scroll to a row by index */
  scrollToIndex: (
    index: number,
    options?: { align?: "start" | "center" | "end" | "auto" },
  ) => void;
  /** Scroll to a node by ID */
  scrollToNode: (id: NodeId) => void;
  /** Callback for measuring row heights (pass to row ref) */
  measureElement: (element: HTMLElement | null) => void;
}

/** Keyboard navigation state returned by useTreeKeyboardNav */
export interface TreeKeyboardNav {
  /** Currently focused node ID */
  activeId: NodeId | null;
  /** Index of active node in flatNodes (-1 if none) */
  activeIndex: number;
  /** Set the active node */
  setActiveId: (id: NodeId | null) => void;
  /** Key event handler (attach to treegrid container) */
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Instance returned by useTreeTable with all tree operations.
 * Pass this to the TreeTable component.
 */
export interface TreeTableInstance<TData extends TreeNodeData> {
  /** Flattened visible nodes (respects expansion) */
  flatNodes: FlatTreeNode<TData>[];
  /** O(1) node lookup by ID */
  nodeById: Map<NodeId, FlatTreeNode<TData>>;
  /** Column definitions */
  columns: TreeColumnDef<TData>[];
  /** Expansion state and controls */
  expansion: TreeExpansion;
  /** Selection state and controls */
  selection: TreeSelection<TData>;
  /** Sorting state and controls */
  sorting: TreeSorting<TData>;
  /** Virtualization state and controls */
  virtualization: TreeVirtualization;
  /** Keyboard navigation state and handler */
  keyboard: TreeKeyboardNav;
  /** Ref for scroll container */
  containerRef: RefObject<HTMLDivElement>;
  /** Get a node by ID */
  getNode: (id: NodeId) => FlatTreeNode<TData> | undefined;
  /** Get currently rendered (visible) nodes */
  getVisibleNodes: () => FlatTreeNode<TData>[];
}

// ============================================================================
// Component Props
// ============================================================================

export type TreeTableStylesNames =
  | "root"
  | "header"
  | "headerRow"
  | "headerCell"
  | "headerCellContent"
  | "body"
  | "row"
  | "rowActive"
  | "cell"
  | "treeCell"
  | "treeCellContent"
  | "expandButton"
  | "checkbox"
  | "loadingRow";

export interface TreeTableStylesProps {
  classNames?: Partial<Record<TreeTableStylesNames, string>>;
  styles?: Partial<Record<TreeTableStylesNames, CSSProperties>>;
}

/** Props for the TreeTable component */
export interface TreeTableProps<TData extends TreeNodeData>
  extends TreeTableStylesProps {
  /** Instance from useTreeTable hook */
  instance: TreeTableInstance<TData>;
  /** Show selection checkboxes */
  showCheckboxes?: boolean;
  /** Show column headers */
  showHeader?: boolean;
  /** Pixels to indent per depth level */
  indentWidth?: number;
  /** Content to show when tree is empty */
  emptyState?: ReactNode;
  /** Content to show for loading rows */
  loadingState?: ReactNode;
  /** Row click handler */
  onRowClick?: (node: FlatTreeNode<TData>, event: MouseEvent) => void;
  /** Row double-click handler */
  onRowDoubleClick?: (node: FlatTreeNode<TData>, event: MouseEvent) => void;
  /** Override default selection state calculation */
  getSelectionState?: (node: FlatTreeNode<TData>) => SelectionState;
  /** Override default checkbox click handling */
  onCheckboxClick?: (
    node: FlatTreeNode<TData>,
    index: number,
    event: MouseEvent,
  ) => void;
  /** Check if a node's children are being loaded (shows spinner) */
  isChildrenLoading?: (node: FlatTreeNode<TData>) => boolean;
  /** Accessible label for the treegrid */
  ariaLabel?: string;
  /** ID of element that labels the treegrid */
  ariaLabelledBy?: string;
}

export interface TreeRowProps<TData extends TreeNodeData> {
  node: FlatTreeNode<TData>;
  instance: TreeTableInstance<TData>;
  virtualItem: VirtualItem;
  showCheckbox?: boolean;
  indentWidth?: number;
  classNames?: TreeTableStylesProps["classNames"];
  styles?: TreeTableStylesProps["styles"];
  onRowClick?: TreeTableProps<TData>["onRowClick"];
  onRowDoubleClick?: TreeTableProps<TData>["onRowDoubleClick"];
}

// ============================================================================
// useTreeTable Options (combined)
// ============================================================================

/** Combined options for useTreeTable hook */
export interface UseTreeTableOptions<TData extends TreeNodeData>
  extends TreeTableOptions<TData>,
    ExpansionOptions,
    SelectionOptions,
    LazyLoadingOptions<TData>,
    SortingOptions,
    KeyboardNavOptions {}
