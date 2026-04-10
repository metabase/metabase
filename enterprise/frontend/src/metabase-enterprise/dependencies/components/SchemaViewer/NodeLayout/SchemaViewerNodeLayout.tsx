import { useNodesInitialized, useReactFlow } from "@xyflow/react";
import { useLayoutEffect, useRef } from "react";

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
  const prevNodeSetKeyRef = useRef<string | null>(null);

  // Layout when nodes are initialized or when unpositioned nodes appear.
  // Incremental updates that arrive already-positioned (e.g. the merge path
  // used on FK expansion in SchemaViewer) are skipped here — we neither
  // re-run Dagre nor shift the viewport, so the user's existing layout and
  // camera position stay put.
  useLayoutEffect(() => {
    if (!isInitialized) {
      return;
    }

    const nodes = getNodes();
    const currentNodeSetKey = getNodeSetKey(nodes);

    if (hasUnpositionedNodes(nodes)) {
      prevNodeSetKeyRef.current = currentNodeSetKey;
      const edges = getEdges();
      const newNodes = getNodesWithPositions(nodes, edges);
      setNodes(newNodes);
      fitView({ nodes: newNodes });
    } else if (prevNodeSetKeyRef.current !== currentNodeSetKey) {
      // Node set changed but everything is already positioned — just sync
      // the key so we don't re-detect this as a "new state" next time.
      prevNodeSetKeyRef.current = currentNodeSetKey;
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView]);

  return null;
}
