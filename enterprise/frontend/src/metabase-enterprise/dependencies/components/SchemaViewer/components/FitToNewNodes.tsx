import { useEffect } from "react";

import { useZoomToNodes } from "../hooks/useZoomToNodes";

type FitToNewNodesProps = {
  nodeIds: readonly string[] | null;
  onDone: () => void;
};

/**
 * When `nodeIds` is set to a non-empty list (e.g. by SchemaViewer when
 * tables have been added via FK expansion, or when an edge has been
 * double-clicked), pan/zoom the camera to the given nodes using the shared
 * {@link useZoomToNodes} rules (≥0.5 zoom, header in viewport). Calls
 * `onDone` once the zoom has been scheduled to clear the pending state.
 */
export function FitToNewNodes({ nodeIds, onDone }: FitToNewNodesProps) {
  const zoomToNodes = useZoomToNodes();
  useEffect(() => {
    if (nodeIds == null || nodeIds.length === 0) {
      return;
    }
    // requestAnimationFrame to let React Flow commit any pending node
    // additions (and their measured dimensions) before we compute bounds.
    const handle = requestAnimationFrame(() => {
      zoomToNodes(nodeIds);
      onDone();
    });
    return () => cancelAnimationFrame(handle);
  }, [nodeIds, zoomToNodes, onDone]);
  return null;
}
