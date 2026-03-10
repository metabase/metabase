import { useNodesInitialized, useReactFlow } from "@xyflow/react";
import { useLayoutEffect, useRef } from "react";

import { useIsCompactMode } from "../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../types";
import { getNodesWithPositions } from "../utils";

// Get a stable key representing the current set of nodes
function getNodeSetKey(nodes: SchemaViewerFlowNode[]): string {
  return nodes
    .map(
      (n) =>
        `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}:${n.style?.opacity ?? 1}`,
    )
    .sort()
    .join(",");
}

function hasUnpositionedNodes(nodes: SchemaViewerFlowNode[]): boolean {
  return nodes.some(
    (node) =>
      (node.position.x === 0 && node.position.y === 0) ||
      node.style?.opacity === 0,
  );
}

export function SchemaViewerNodeLayout() {
  const { getNodes, getEdges, setNodes, fitView } =
    useReactFlow<SchemaViewerFlowNode>();
  const isInitialized = useNodesInitialized();
  const isCompactMode = useIsCompactMode();
  const prevNodeSetKeyRef = useRef<string | null>(null);
  const prevCompactModeRef = useRef(isCompactMode);

  // Layout when nodes are initialized or when the set of nodes changes
  useLayoutEffect(() => {
    if (isInitialized) {
      const nodes = getNodes();
      const currentNodeSetKey = getNodeSetKey(nodes);

      // Run layout if this is a new node state, or if nodes are not yet positioned/revealed.
      if (
        prevNodeSetKeyRef.current !== currentNodeSetKey ||
        hasUnpositionedNodes(nodes)
      ) {
        prevNodeSetKeyRef.current = currentNodeSetKey;
        prevCompactModeRef.current = isCompactMode;
        const edges = getEdges();
        const newNodes = getNodesWithPositions(nodes, edges, isCompactMode);
        setNodes(newNodes);
        fitView({ nodes: newNodes });
      }
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView, isCompactMode]);

  // Relayout when switching between compact and regular mode (no fitView to avoid feedback loop)
  useLayoutEffect(() => {
    if (isInitialized && prevCompactModeRef.current !== isCompactMode) {
      prevCompactModeRef.current = isCompactMode;
      const nodes = getNodes();
      const edges = getEdges();
      const newNodes = getNodesWithPositions(nodes, edges, isCompactMode);
      setNodes(newNodes);
    }
  }, [isCompactMode, isInitialized, getNodes, getEdges, setNodes]);

  return null;
}
