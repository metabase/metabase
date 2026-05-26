import { useCallback, useRef } from "react";

import type { SchemaViewerFlowEdge } from "../types";

type UseEdgeZoomArgs = {
  zoomToNode: (nodeId: string) => void;
};

/**
 * Returns an edge-click handler that zooms the camera to one endpoint of an
 * already-selected edge. Successive double-clicks on the same edge alternate
 * between the source and target node so the user can flip back and forth
 * between the two ends without manually selecting either.
 */
export function useEdgeZoom({ zoomToNode }: UseEdgeZoomArgs) {
  const lastEdgeSideRef = useRef<Map<string, "source" | "target">>(new Map());

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: SchemaViewerFlowEdge) => {
      if (!edge.selected) {
        return;
      }
      const previousSide = lastEdgeSideRef.current.get(edge.id);
      const nextSide: "source" | "target" =
        previousSide === "source" ? "target" : "source";
      lastEdgeSideRef.current.set(edge.id, nextSide);
      const targetNodeId = nextSide === "source" ? edge.source : edge.target;
      zoomToNode(targetNodeId);
    },
    [zoomToNode],
  );

  return { handleEdgeClick };
}
