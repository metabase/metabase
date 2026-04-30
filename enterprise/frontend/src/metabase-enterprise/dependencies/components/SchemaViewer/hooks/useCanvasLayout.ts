import { type Dispatch, useCallback } from "react";

import type {
  SchemaViewerFlowEdge,
  SchemaViewerFlowNode,
  ViewportFitAction,
} from "../types";
import { focusNodeLayout, getNodesWithPositions } from "../utils";

type UseCanvasLayoutArgs = {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
  setNodes: React.Dispatch<React.SetStateAction<SchemaViewerFlowNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<SchemaViewerFlowEdge[]>>;
  dispatchViewportFit: Dispatch<ViewportFitAction>;
};

type UseCanvasLayoutResult = {
  /**
   * Re-run default nodes placement over the entire canvas. No-op when the canvas
   * is empty.
   */
  relayout: () => void;
  /**
   * Apply a focal layout centered on `nodeId`: incoming neighbors stack to
   * the left of the focal node, outgoing to the right, the rest place
   * relative to neighbors. Clears node and edge selection so the fresh
   * layout starts clean, then zooms onto the focal node.
   */
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
  dispatchViewportFit,
}: UseCanvasLayoutArgs): UseCanvasLayoutResult {
  const relayout = useCallback(() => {
    if (nodes.length === 0) {
      return;
    }
    const laidOut = getNodesWithPositions(nodes, edges);
    setNodes(laidOut);
    dispatchViewportFit({ type: "fitAll" });
  }, [nodes, edges, setNodes, dispatchViewportFit]);

  const focusOnNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => {
        const laidOut = focusNodeLayout(
          nodeId,
          currentNodes,
          edges.map((edge) => ({ source: edge.source, target: edge.target })),
        );
        // Clear any previous node selection so the fresh layout starts from
        // a clean slate.
        return laidOut.map((n) => (n.selected ? { ...n, selected: false } : n));
      });
      // Drop any edge highlighting from before the rearrangement.
      setEdges((currentEdges) =>
        currentEdges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      );
      // Zoom in on the focal node itself — useZoomToNodes clamps to ≥0.5 so
      // the table stays legible, and keeps the node's header in view.
      dispatchViewportFit({ type: "fitNodes", nodeIds: [nodeId] });
    },
    [edges, setNodes, setEdges, dispatchViewportFit],
  );

  return { relayout, focusOnNode };
}
