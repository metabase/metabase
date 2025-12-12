import type { MouseEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import type {
  FlatTreeNode,
  NodeId,
  SelectionState,
  TreeNodeData,
  TreeSelection,
} from "../types";

import { getAllLeafIds } from "./useTreeFlatten";

/** Options for tree selection behavior */
export interface UseTreeSelectionOptions<TData extends TreeNodeData> {
  /** Current flattened (visible) nodes */
  flatNodes: FlatTreeNode<TData>[];
  /** Original hierarchical data (for descendant lookup) */
  data: TData[];
  /** Function to get children of a node */
  getChildren: (node: TData) => TData[] | undefined | null;
  /** Function to get unique ID of a node */
  getNodeId: (node: TData) => NodeId;
  /** Selection mode: none, single, or multi */
  selectionMode?: "none" | "single" | "multi";
  /** Controlled selected IDs */
  selectedIds?: Set<NodeId>;
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: Set<NodeId>) => void;
  /** Initial selected IDs for uncontrolled mode */
  initialSelectedIds?: Set<NodeId>;
  /** Enable shift+click range selection in multi mode */
  enableRangeSelection?: boolean;
}

/**
 * Manages tree selection state with support for single/multi selection modes.
 *
 * Features:
 * - Parent nodes show tri-state checkbox (none/some/all children selected)
 * - Clicking parent toggles all descendants
 * - Shift+click for range selection
 * - Controlled/uncontrolled mode support
 */
export function useTreeSelection<TData extends TreeNodeData>({
  flatNodes,
  data,
  getChildren,
  getNodeId,
  selectionMode = "none",
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  initialSelectedIds,
  enableRangeSelection = true,
}: UseTreeSelectionOptions<TData>): TreeSelection<TData> {
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<NodeId>>(
    () => initialSelectedIds ?? new Set(),
  );

  // For shift+click range selection
  const lastSelectedIndex = useRef<number | null>(null);

  const isControlled = controlledSelectedIds !== undefined;
  const selectedIds = isControlled
    ? controlledSelectedIds
    : internalSelectedIds;

  // Pre-compute descendants for each parent node (O(1) lookup vs O(n) traversal)
  const descendantCache = useMemo(() => {
    const cache = new Map<NodeId, NodeId[]>();

    const collectDescendants = (nodes: TData[]): NodeId[] => {
      const ids: NodeId[] = [];
      for (const node of nodes) {
        const id = getNodeId(node);
        ids.push(id);
        const children = getChildren(node);
        if (children && children.length > 0) {
          ids.push(...collectDescendants(children));
        }
      }
      return ids;
    };

    const buildCache = (nodes: TData[]) => {
      for (const node of nodes) {
        const id = getNodeId(node);
        const children = getChildren(node);
        if (children && children.length > 0) {
          cache.set(id, collectDescendants(children));
          buildCache(children);
        }
      }
    };

    buildCache(data);
    return cache;
  }, [data, getChildren, getNodeId]);

  // O(1) lookup for visible nodes (to check disabled state)
  const flatNodeById = useMemo(() => {
    const map = new Map<NodeId, FlatTreeNode<TData>>();
    for (const node of flatNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [flatNodes]);

  const setSelectedIds = useCallback(
    (ids: Set<NodeId>) => {
      if (!isControlled) {
        setInternalSelectedIds(ids);
      }
      onSelectionChange?.(ids);
    },
    [isControlled, onSelectionChange],
  );

  const isSelected = useCallback(
    (id: NodeId) => selectedIds.has(id),
    [selectedIds],
  );

  const getSelectionState = useCallback(
    (node: FlatTreeNode<TData>): SelectionState => {
      if (!node.hasChildren) {
        return selectedIds.has(node.id) ? "all" : "none";
      }

      const descendantIds = descendantCache.get(node.id);

      if (!descendantIds || descendantIds.length === 0) {
        return selectedIds.has(node.id) ? "all" : "none";
      }

      const selectedCount = descendantIds.filter((id) =>
        selectedIds.has(id),
      ).length;

      if (selectedCount === 0) {
        return "none";
      }
      if (selectedCount === descendantIds.length) {
        return "all";
      }
      return "some";
    },
    [selectedIds, descendantCache],
  );

  const select = useCallback(
    (id: NodeId) => {
      if (selectionMode === "none") {
        return;
      }

      if (selectionMode === "single") {
        setSelectedIds(new Set([id]));
        return;
      }

      const newIds = new Set(selectedIds);
      newIds.add(id);
      setSelectedIds(newIds);
    },
    [selectionMode, selectedIds, setSelectedIds],
  );

  const deselect = useCallback(
    (id: NodeId) => {
      if (selectionMode === "none") {
        return;
      }

      const newIds = new Set(selectedIds);
      newIds.delete(id);
      setSelectedIds(newIds);
    },
    [selectionMode, selectedIds, setSelectedIds],
  );

  const toggle = useCallback(
    (id: NodeId, event?: MouseEvent) => {
      if (selectionMode === "none") {
        return;
      }

      const nodeIndex = flatNodes.findIndex((n) => n.id === id);
      const node = flatNodes[nodeIndex];

      if (!node || node.isDisabled || node.isLoading) {
        return;
      }

      const isShiftPressed = event?.shiftKey ?? false;

      if (
        selectionMode === "multi" &&
        enableRangeSelection &&
        isShiftPressed &&
        lastSelectedIndex.current !== null
      ) {
        const start = Math.min(lastSelectedIndex.current, nodeIndex);
        const end = Math.max(lastSelectedIndex.current, nodeIndex);
        const rangeNodes = flatNodes
          .slice(start, end + 1)
          .filter((n) => !n.isDisabled && !n.isLoading);

        const newIds = new Set(selectedIds);
        for (const rangeNode of rangeNodes) {
          newIds.add(rangeNode.id);
        }
        setSelectedIds(newIds);
        lastSelectedIndex.current = nodeIndex;
        return;
      }

      if (selectionMode === "single") {
        if (selectedIds.has(id)) {
          setSelectedIds(new Set());
        } else {
          setSelectedIds(new Set([id]));
        }
        lastSelectedIndex.current = nodeIndex;
        return;
      }

      if (node.hasChildren) {
        const descendantIds = descendantCache.get(id) ?? [];
        const allSelected =
          descendantIds.length > 0 &&
          descendantIds.every((did) => selectedIds.has(did));

        const newIds = new Set(selectedIds);
        if (allSelected) {
          for (const did of descendantIds) {
            newIds.delete(did);
          }
          newIds.delete(id);
        } else {
          for (const did of descendantIds) {
            const descendantNode = flatNodeById.get(did);
            if (!descendantNode?.isDisabled && !descendantNode?.isLoading) {
              newIds.add(did);
            }
          }
        }
        setSelectedIds(newIds);
      } else {
        const newIds = new Set(selectedIds);
        if (newIds.has(id)) {
          newIds.delete(id);
        } else {
          newIds.add(id);
        }
        setSelectedIds(newIds);
      }

      lastSelectedIndex.current = nodeIndex;
    },
    [
      selectionMode,
      flatNodes,
      flatNodeById,
      selectedIds,
      setSelectedIds,
      enableRangeSelection,
      descendantCache,
    ],
  );

  const selectRange = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (selectionMode !== "multi") {
        return;
      }

      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      const rangeNodes = flatNodes
        .slice(start, end + 1)
        .filter((n) => !n.isDisabled && !n.isLoading);

      const newIds = new Set(selectedIds);
      for (const node of rangeNodes) {
        newIds.add(node.id);
      }
      setSelectedIds(newIds);
    },
    [selectionMode, flatNodes, selectedIds, setSelectedIds],
  );

  const selectAll = useCallback(() => {
    if (selectionMode !== "multi") {
      return;
    }

    const allLeafIds = getAllLeafIds(data, getChildren, getNodeId);
    setSelectedIds(new Set(allLeafIds));
  }, [selectionMode, data, getChildren, getNodeId, setSelectedIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIndex.current = null;
  }, [setSelectedIds]);

  return {
    selectedIds,
    selectionMode,
    isSelected,
    getSelectionState,
    select,
    deselect,
    toggle,
    selectRange,
    selectAll,
    deselectAll,
  };
}
