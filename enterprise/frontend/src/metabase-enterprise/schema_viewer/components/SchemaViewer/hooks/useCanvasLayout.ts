import { useCallback } from "react";
import { useLatest } from "react-use";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

import type { GraphLayoutMethods } from "./useGraphLayout";

type UseCanvasLayoutArgs = {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
  setNodes: React.Dispatch<React.SetStateAction<SchemaViewerFlowNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<SchemaViewerFlowEdge[]>>;
  zoomToNode: (nodeId: string) => void;
  zoomToCanvas: () => void;
  graphLayout: Pick<GraphLayoutMethods, "requestLayout">;
};

type UseCanvasLayoutResult = {
  resetLayout: () => void;
  focusOnNode: (nodeId: string) => void;
};

function applyLayoutGeometry(
  currentNodes: SchemaViewerFlowNode[],
  laidOutNodes: SchemaViewerFlowNode[],
  clearSelection = false,
) {
  const laidOutNodesById = new Map(laidOutNodes.map((node) => [node.id, node]));

  return currentNodes.map((node) => {
    const laidOutNode = laidOutNodesById.get(node.id);
    if (laidOutNode == null) {
      return node;
    }
    const data =
      clearSelection && node.data.selectedFieldIds.size > 0
        ? { ...node.data, selectedFieldIds: new Set<number>() }
        : node.data;
    return {
      ...node,
      position: laidOutNode.position,
      style: { ...node.style, ...laidOutNode.style },
      selected: clearSelection ? false : node.selected,
      data,
    };
  });
}

/** Manual layout actions exposed to the UI. */
export function useCanvasLayout({
  nodes,
  edges,
  setNodes,
  setEdges,
  zoomToNode,
  zoomToCanvas,
  graphLayout,
}: UseCanvasLayoutArgs): UseCanvasLayoutResult {
  const { requestLayout } = graphLayout;
  // Read through refs so the actions keep their identity while a table drag
  // produces new nodes every frame; memoized toolbar controls depend on it.
  const nodesRef = useLatest(nodes);
  const edgesRef = useLatest(edges);

  const resetLayout = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) {
      return;
    }

    void requestLayout(
      { mode: "fresh", nodes, edges: edgesRef.current },
      "auto-layout",
    ).then((outcome) => {
      if (outcome.status !== "success") {
        return;
      }
      setNodes((currentNodes) =>
        applyLayoutGeometry(currentNodes, outcome.result.nodes),
      );
      zoomToCanvas();
    });
  }, [nodesRef, edgesRef, requestLayout, setNodes, zoomToCanvas]);

  const focusOnNode = useCallback(
    (nodeId: string) => {
      void requestLayout(
        {
          mode: "focus",
          focalId: nodeId,
          nodes: nodesRef.current,
          edges: edgesRef.current,
        },
        "focus-node",
      ).then((outcome) => {
        if (outcome.status !== "success") {
          return;
        }
        setNodes((currentNodes) =>
          applyLayoutGeometry(currentNodes, outcome.result.nodes, true),
        );
        setEdges((currentEdges) =>
          currentEdges.map((edge) =>
            edge.selected ? { ...edge, selected: false } : edge,
          ),
        );
        zoomToNode(nodeId);
      });
    },
    [nodesRef, edgesRef, requestLayout, setEdges, setNodes, zoomToNode],
  );

  return { resetLayout, focusOnNode };
}
