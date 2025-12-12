import { useCallback, useEffect, useMemo, useRef } from "react";

import { DEFAULT_OVERSCAN, DEFAULT_ROW_HEIGHT } from "../constants";
import type {
  FlatTreeNode,
  NodeId,
  TreeNodeData,
  TreeTableInstance,
  UseTreeTableOptions,
} from "../types";

import { useTreeExpansion } from "./useTreeExpansion";
import { useTreeFlatten } from "./useTreeFlatten";
import { useTreeKeyboardNav } from "./useTreeKeyboardNav";
import { useTreeSelection } from "./useTreeSelection";
import { useTreeSorting } from "./useTreeSorting";
import { useTreeVirtualization } from "./useTreeVirtualization";

/**
 * Main hook for creating a TreeTable instance with all tree operations.
 *
 * Composes multiple sub-hooks to provide:
 * - Tree flattening with expansion state
 * - Row selection (single/multi with range support)
 * - Column sorting (client-side or manual)
 * - Virtualization for large datasets
 * - Keyboard navigation (arrows, home/end, space/enter)
 * - Lazy loading support for async children
 */
export function useTreeTable<TData extends TreeNodeData>(
  options: UseTreeTableOptions<TData>,
): TreeTableInstance<TData> {
  const {
    data,
    columns,
    getChildren,
    getNodeId,
    isExpandable,
    isDisabled,
    defaultRowHeight = DEFAULT_ROW_HEIGHT,
    overscan = DEFAULT_OVERSCAN,
    expandedIds: controlledExpandedIds,
    onExpandedChange,
    defaultExpandedIds,
    autoExpandSingleChild = false,
    selectionMode = "none",
    selectedIds: controlledSelectedIds,
    onSelectionChange,
    initialSelectedIds,
    enableRangeSelection = true,
    onLoadChildren,
    loadingIds,
    hasUnloadedChildren,
    sorting: controlledSorting,
    onSortingChange,
    manualSorting = false,
    enableKeyboardNav = true,
    activeId: controlledActiveId,
    onActiveChange,
  } = options;

  const sorting = useTreeSorting({
    columns,
    getChildren,
    sorting: controlledSorting,
    onSortingChange,
    manualSorting,
  });

  const sortedData = useMemo(() => {
    return sorting.sortData(data);
  }, [sorting, data]);

  const effectiveIsExpandable = useCallback(
    (node: TData) => {
      if (isExpandable) {
        return isExpandable(node);
      }
      const children = getChildren(node);
      return (
        Boolean(children && children.length > 0) ||
        Boolean(hasUnloadedChildren?.(node))
      );
    },
    [isExpandable, getChildren, hasUnloadedChildren],
  );

  // Collect ALL node IDs (including collapsed) for expandAll() to work correctly
  const allNodeIds = useMemo(() => {
    const ids = new Set<NodeId>();
    const collectIds = (nodes: TData[]) => {
      for (const node of nodes) {
        ids.add(getNodeId(node));
        const children = getChildren(node);
        if (children && children.length > 0) {
          collectIds(children);
        }
      }
    };
    collectIds(sortedData);
    return ids;
  }, [sortedData, getNodeId, getChildren]);

  const expansion = useTreeExpansion({
    expandedIds: controlledExpandedIds,
    onExpandedChange,
    defaultExpandedIds,
    allNodeIds,
  });

  const { flatNodes, nodeById } = useTreeFlatten({
    data: sortedData,
    getChildren,
    getNodeId,
    expandedIds: expansion.expandedIds,
    isExpandable: effectiveIsExpandable,
    isDisabled,
    loadingIds,
  });

  const selection = useTreeSelection({
    flatNodes,
    data: sortedData,
    getChildren,
    getNodeId,
    selectionMode,
    selectedIds: controlledSelectedIds,
    onSelectionChange,
    initialSelectedIds,
    enableRangeSelection,
  });

  const virtualization = useTreeVirtualization({
    flatNodes,
    nodeById,
    defaultRowHeight,
    overscan,
  });

  const keyboard = useTreeKeyboardNav({
    flatNodes,
    nodeById,
    expansion,
    selection,
    virtualization,
    enableKeyboardNav,
    activeId: controlledActiveId,
    onActiveChange,
  });

  // Auto-expand when there's only one root node (e.g., single database in picker)
  useEffect(() => {
    if (!autoExpandSingleChild) {
      return;
    }

    if (sortedData.length === 1) {
      const singleNode = sortedData[0];
      const nodeId = getNodeId(singleNode);
      if (!expansion.isExpanded(nodeId)) {
        expansion.expand(nodeId);
      }
    }
  }, [sortedData, getNodeId, autoExpandSingleChild, expansion]);

  // Track nodes currently being loaded to prevent duplicate requests
  const loadingNodesRef = useRef<Set<NodeId>>(new Set());

  // Trigger lazy loading when expanded nodes have unloaded children
  useEffect(() => {
    if (!onLoadChildren) {
      return;
    }

    for (const node of flatNodes) {
      if (
        node.isExpanded &&
        node.hasChildren &&
        hasUnloadedChildren?.(node.data) &&
        !loadingNodesRef.current.has(node.id)
      ) {
        loadingNodesRef.current.add(node.id);
        onLoadChildren(node.data).finally(() => {
          loadingNodesRef.current.delete(node.id);
        });
      }
    }
  }, [flatNodes, onLoadChildren, hasUnloadedChildren]);

  const getNode = useCallback(
    (id: NodeId): FlatTreeNode<TData> | undefined => {
      return nodeById.get(id);
    },
    [nodeById],
  );

  const getVisibleNodes = useCallback((): FlatTreeNode<TData>[] => {
    return virtualization.virtualItems
      .map((virtualItem) => flatNodes[virtualItem.index])
      .filter((node): node is FlatTreeNode<TData> => node !== undefined);
  }, [virtualization.virtualItems, flatNodes]);

  return {
    flatNodes,
    nodeById,
    columns,
    expansion,
    selection,
    sorting,
    virtualization,
    keyboard,
    containerRef: virtualization.containerRef,
    getNode,
    getVisibleNodes,
  };
}
