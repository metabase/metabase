import type { ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import {
  ZOOM_DURATION_MS,
  zoomToNode as zoomToNodeInternal,
} from "../utils/zoom";

type PendingZoomRequest =
  | { kind: "all" }
  | { kind: "node"; nodeId: string; retriesLeft: number };

// When `setNodes` and `zoomToNode` fire in the same useEffect, the ReactFlow
// store may not yet have the new node by the time the first rAF fires.
// We retry across a few frames so the zoom lands once the store has caught up.
const NODE_ZOOM_MAX_RETRIES = 8;

type SchemaViewerInstance = ReactFlowInstance<
  SchemaViewerFlowNode,
  SchemaViewerFlowEdge
>;

export type SchemaViewerZoomMethods = {
  zoomToNode: (nodeId: string) => void;
  zoomToCanvas: () => void;
  cancelZoom: () => void;
};

export function useSchemaViewerZoomMethods(
  instance: SchemaViewerInstance | null,
): SchemaViewerZoomMethods {
  const instanceRef = useRef(instance);
  instanceRef.current = instance;

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
    if (pendingZoomRequest.kind === "all") {
      pendingZoomRequestRef.current = null;
      instance.fitView({ duration: ZOOM_DURATION_MS });
      return;
    }
    const succeeded = zoomToNodeInternal(instance, pendingZoomRequest.nodeId);
    if (succeeded) {
      pendingZoomRequestRef.current = null;
      return;
    }
    // Target node not yet in the ReactFlow store — try again next frame
    // so the camera still lands on it once the store sync catches up.
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
        retriesLeft: NODE_ZOOM_MAX_RETRIES,
      };
      scheduleZoom();
    },
    [scheduleZoom],
  );

  const zoomToCanvas = useCallback(() => {
    pendingZoomRequestRef.current = { kind: "all" };
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
