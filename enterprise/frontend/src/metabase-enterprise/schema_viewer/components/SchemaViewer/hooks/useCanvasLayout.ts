import { useCallback } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import { applyLayout } from "../utils/layout";

type UseCanvasLayoutArgs = {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
  setNodes: React.Dispatch<React.SetStateAction<SchemaViewerFlowNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<SchemaViewerFlowEdge[]>>;
  zoomToNode: (nodeId: string) => void;
  zoomToCanvas: () => void;
};

type UseCanvasLayoutResult = {
  resetLayout: () => void;
  focusOnNode: (nodeId: string) => void;
};

/**
 * Manual layout actions exposed to the UI.
 */
export function useCanvasLayout({
  nodes,
  edges,
  setNodes,
  setEdges,
  zoomToNode,
  zoomToCanvas,
}: UseCanvasLayoutArgs): UseCanvasLayoutResult {
  const resetLayout = useCallback(() => {
    if (nodes.length === 0) {
      return;
    }
    const { nodes: laidOut } = applyLayout({ mode: "fresh", nodes, edges });
    setNodes(laidOut);
    zoomToCanvas();
  }, [nodes, edges, setNodes, zoomToCanvas]);

  const focusOnNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => {
        const { nodes: laidOut } = applyLayout({
          mode: "focus",
          focalId: nodeId,
          nodes: currentNodes,
          edges,
        });
        return laidOut.map((n) => (n.selected ? { ...n, selected: false } : n));
      });
      setEdges((currentEdges) =>
        currentEdges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      );
      zoomToNode(nodeId);
    },
    [edges, setNodes, setEdges, zoomToNode],
  );

  return { resetLayout, focusOnNode };
}
