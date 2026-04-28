import { useCallback, useRef } from "react";

import type { SchemaViewerFlowEdge } from "./types";

interface UseEdgeZoomArgs {
  setPendingFitNodeIds: (nodeIds: readonly string[] | null) => void;
}

/**
 * Returns an edge-click handler that zooms the camera to one endpoint of an
 * already-selected edge. Successive double-clicks on the same edge alternate
 * between the source and target node so the user can flip back and forth
 * between the two ends without manually selecting either.
 *
 * The first click — the one that selects the edge — is left alone, so the
 * zoom only kicks in once the user has clearly chosen that edge. The edge
 * stays selected — fitView doesn't touch React Flow's selection state.
 */
export function useEdgeZoom({ setPendingFitNodeIds }: UseEdgeZoomArgs) {
  // Per-edge memory of which endpoint the camera last zoomed to, so
  // successive double-clicks on the same edge alternate source → target.
  const lastEdgeZoomSideRef = useRef<Map<string, "source" | "target">>(
    new Map(),
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: SchemaViewerFlowEdge) => {
      if (!edge.selected) {
        return;
      }
      const previousSide = lastEdgeZoomSideRef.current.get(edge.id);
      const nextSide: "source" | "target" =
        previousSide === "source" ? "target" : "source";
      lastEdgeZoomSideRef.current.set(edge.id, nextSide);
      const targetNodeId = nextSide === "source" ? edge.source : edge.target;
      setPendingFitNodeIds([targetNodeId]);
    },
    [setPendingFitNodeIds],
  );

  return { handleEdgeClick };
}
