import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import {
  type CanvasSize,
  ZOOM_DURATION_MS,
  getCanvasSize,
  getGraphOverviewViewport,
  getNodeFocusViewport,
} from "../utils/zoom";

type ZoomTarget = Pick<
  ReactFlowInstance<SchemaViewerFlowNode, SchemaViewerFlowEdge>,
  "setViewport"
>;

type PendingZoomRequest =
  | { kind: "all"; retriesLeft: number }
  | { kind: "node"; nodeId: string; retriesLeft: number };

// When `setNodes` and a zoom request fire in the same tick, the logical nodes
// may not include the new graph by the time the first rAF fires. We retry
// across a few frames so the zoom lands once state has caught up.
const ZOOM_MAX_RETRIES = 8;

function getDestination(
  request: PendingZoomRequest,
  nodes: readonly SchemaViewerFlowNode[],
  edges: readonly SchemaViewerFlowEdge[],
  size: CanvasSize,
): Viewport | null {
  if (request.kind === "all") {
    return getGraphOverviewViewport(nodes, edges, size);
  }
  return getNodeFocusViewport(nodes, request.nodeId, size);
}

export type SchemaViewerZoomMethods = {
  zoomToNode: (nodeId: string) => void;
  zoomToCanvas: () => void;
  cancelZoom: () => void;
};

/**
 * Camera moves for the logical graph. `onBeforeMove` receives the destination
 * before the camera moves, so the rendered window can include it in advance.
 */
export function useSchemaViewerZoomMethods(
  instance: ZoomTarget | null,
  nodes: readonly SchemaViewerFlowNode[],
  edges: readonly SchemaViewerFlowEdge[],
  onBeforeMove: (viewport: Viewport, size: CanvasSize) => void,
): SchemaViewerZoomMethods {
  const instanceRef = useRef(instance);
  instanceRef.current = instance;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const onBeforeMoveRef = useRef(onBeforeMove);
  onBeforeMoveRef.current = onBeforeMove;
  // The first move replaces React Flow's initial `fitView`, so it jumps.
  const hasMovedRef = useRef(false);

  const pendingZoomRequestRef = useRef<PendingZoomRequest | null>(null);
  const nextTickRef = useRef<number | null>(null);

  // `schedule` and `drain` reference each other — declare `schedule` via ref
  // so `drain` can re-arm the next tick for retry without a dependency cycle.
  const scheduleRef = useRef<() => void>(() => {});

  const drain = useCallback(() => {
    nextTickRef.current = null;
    const pendingZoomRequest = pendingZoomRequestRef.current;
    const instance = instanceRef.current;
    if (pendingZoomRequest == null || instance == null) {
      pendingZoomRequestRef.current = null;
      return;
    }
    const size = getCanvasSize();
    const viewport =
      size == null
        ? null
        : getDestination(
            pendingZoomRequest,
            nodesRef.current,
            edgesRef.current,
            size,
          );
    if (size != null && viewport != null) {
      pendingZoomRequestRef.current = null;
      onBeforeMoveRef.current(viewport, size);
      instance.setViewport(viewport, {
        duration: hasMovedRef.current ? ZOOM_DURATION_MS : 0,
      });
      hasMovedRef.current = true;
      return;
    }
    // Target nodes are not in the logical nodes yet — try again next frame
    // so the camera still lands once state catches up.
    if (pendingZoomRequest.retriesLeft > 0) {
      pendingZoomRequestRef.current = {
        ...pendingZoomRequest,
        retriesLeft: pendingZoomRequest.retriesLeft - 1,
      };
      scheduleRef.current();
      return;
    }
    pendingZoomRequestRef.current = null;
  }, []);

  const scheduleZoom = useCallback(() => {
    if (nextTickRef.current != null) {
      return;
    }
    nextTickRef.current = requestAnimationFrame(drain);
  }, [drain]);

  scheduleRef.current = scheduleZoom;

  useEffect(() => {
    if (instance != null && pendingZoomRequestRef.current != null) {
      scheduleZoom();
    }
  }, [instance, scheduleZoom]);

  const zoomToNode = useCallback(
    (nodeId: string) => {
      pendingZoomRequestRef.current = {
        kind: "node",
        nodeId,
        retriesLeft: ZOOM_MAX_RETRIES,
      };
      scheduleZoom();
    },
    [scheduleZoom],
  );

  const zoomToCanvas = useCallback(() => {
    pendingZoomRequestRef.current = {
      kind: "all",
      retriesLeft: ZOOM_MAX_RETRIES,
    };
    scheduleZoom();
  }, [scheduleZoom]);

  const cancelZoom = useCallback(() => {
    pendingZoomRequestRef.current = null;
    if (nextTickRef.current != null) {
      cancelAnimationFrame(nextTickRef.current);
      nextTickRef.current = null;
    }
  }, []);

  return { zoomToNode, zoomToCanvas, cancelZoom };
}
