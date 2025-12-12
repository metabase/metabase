import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef } from "react";

import { DEFAULT_OVERSCAN, DEFAULT_ROW_HEIGHT } from "../constants";
import type {
  FlatTreeNode,
  NodeId,
  TreeNodeData,
  TreeVirtualization,
} from "../types";

/** Options for virtualized rendering */
export interface UseTreeVirtualizationOptions<TData extends TreeNodeData> {
  /** Flattened visible nodes to virtualize */
  flatNodes: FlatTreeNode<TData>[];
  /** Map for node lookup (used by scrollToNode) */
  nodeById: Map<NodeId, FlatTreeNode<TData>>;
  /** Estimated row height for initial render */
  defaultRowHeight?: number;
  /** Number of rows to render outside visible area */
  overscan?: number;
}

/**
 * Wraps @tanstack/react-virtual for efficient rendering of large trees.
 * Only renders visible rows plus overscan buffer.
 * Supports dynamic row heights via measureElement callback.
 */
export function useTreeVirtualization<TData extends TreeNodeData>({
  flatNodes,
  nodeById,
  defaultRowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
}: UseTreeVirtualizationOptions<TData>): TreeVirtualization {
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => defaultRowHeight,
    overscan,
    getItemKey: (index) => flatNodes[index]?.id ?? index,
    measureElement: (element) =>
      element?.getBoundingClientRect().height ?? defaultRowHeight,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const scrollToIndex = useCallback(
    (
      index: number,
      options?: { align?: "start" | "center" | "end" | "auto" },
    ) => {
      virtualizer.scrollToIndex(index, {
        align: options?.align ?? "auto",
        behavior: "auto",
      });
    },
    [virtualizer],
  );

  const scrollToNode = useCallback(
    (id: NodeId) => {
      const node = nodeById.get(id);
      if (node) {
        scrollToIndex(node.index);
      }
    },
    [nodeById, scrollToIndex],
  );

  const measureElement = useCallback(
    (element: HTMLElement | null) => {
      if (element) {
        virtualizer.measureElement(element);
      }
    },
    [virtualizer],
  );

  return {
    containerRef,
    virtualizer,
    virtualItems,
    totalSize,
    scrollToIndex,
    scrollToNode,
    measureElement,
  };
}
