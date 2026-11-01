import { useRef } from "react";

import type { SchemaViewerFlowNode } from "../types";

/**
 * Returns `nodes`, except while a table is being dragged: React Flow then
 * produces a new array every frame, so consumers that only need table
 * metadata or final positions (search, info panel, minimap) keep the
 * pre-drag array and update once on drop.
 */
export function useSettledNodes(
  nodes: SchemaViewerFlowNode[],
  isNodeDragging: boolean,
): SchemaViewerFlowNode[] {
  const settledNodesRef = useRef(nodes);
  if (!isNodeDragging) {
    settledNodesRef.current = nodes;
  }
  return settledNodesRef.current;
}
