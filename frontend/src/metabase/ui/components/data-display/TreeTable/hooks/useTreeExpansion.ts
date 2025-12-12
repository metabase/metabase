import { useCallback, useState } from "react";

import type { NodeId, TreeExpansion } from "../types";

/** Options for controlling tree node expansion state */
export interface UseTreeExpansionOptions {
  /** Controlled expanded IDs (makes component controlled) */
  expandedIds?: Set<NodeId>;
  /** Callback when expansion state changes */
  onExpandedChange?: (expandedIds: Set<NodeId>) => void;
  /** Initial expanded IDs for uncontrolled mode */
  defaultExpandedIds?: Set<NodeId>;
  /** All node IDs in the tree (needed for expandAll) */
  allNodeIds: Set<NodeId>;
}

/**
 * Manages tree node expansion state with controlled/uncontrolled support.
 * Provides expand, collapse, toggle, expandAll, and collapseAll operations.
 */
export function useTreeExpansion({
  expandedIds: controlledExpandedIds,
  onExpandedChange,
  defaultExpandedIds,
  allNodeIds,
}: UseTreeExpansionOptions): TreeExpansion {
  const [internalExpandedIds, setInternalExpandedIds] = useState<Set<NodeId>>(
    () => defaultExpandedIds ?? new Set(),
  );

  const isControlled = controlledExpandedIds !== undefined;
  const expandedIds = isControlled
    ? controlledExpandedIds
    : internalExpandedIds;

  const setExpandedIds = useCallback(
    (ids: Set<NodeId>) => {
      if (!isControlled) {
        setInternalExpandedIds(ids);
      }
      onExpandedChange?.(ids);
    },
    [isControlled, onExpandedChange],
  );

  const isExpanded = useCallback(
    (id: NodeId) => expandedIds.has(id),
    [expandedIds],
  );

  const expand = useCallback(
    (id: NodeId) => {
      if (!expandedIds.has(id)) {
        const newIds = new Set(expandedIds);
        newIds.add(id);
        setExpandedIds(newIds);
      }
    },
    [expandedIds, setExpandedIds],
  );

  const collapse = useCallback(
    (id: NodeId) => {
      if (expandedIds.has(id)) {
        const newIds = new Set(expandedIds);
        newIds.delete(id);
        setExpandedIds(newIds);
      }
    },
    [expandedIds, setExpandedIds],
  );

  const toggle = useCallback(
    (id: NodeId) => {
      const newIds = new Set(expandedIds);
      if (newIds.has(id)) {
        newIds.delete(id);
      } else {
        newIds.add(id);
      }
      setExpandedIds(newIds);
    },
    [expandedIds, setExpandedIds],
  );

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(allNodeIds));
  }, [allNodeIds, setExpandedIds]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, [setExpandedIds]);

  return {
    expandedIds,
    isExpanded,
    expand,
    collapse,
    toggle,
    expandAll,
    collapseAll,
    setExpandedIds,
  };
}
