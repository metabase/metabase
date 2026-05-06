import type { ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import { ZOOM_DURATION_MS, zoomToNodes } from "../utils/zoom";

type PendingFit = { kind: "all" } | { kind: "node"; nodeId: string };

type SchemaViewerInstance = ReactFlowInstance<
  SchemaViewerFlowNode,
  SchemaViewerFlowEdge
>;

export type SchemaViewerZoomMethods = {
  /**
   * Pan/zoom to a single node using the shared zoom rules (≥0.5 zoom, header
   * pinned near the top). Calls coalesce: a fresh request supersedes the
   * previous one until the next animation frame.
   */
  zoomToNode: (nodeId: string) => void;
  /** Fit the entire canvas (ReactFlow's `fitView`, animated). */
  zoomToCanvas: () => void;
  /** Drop any pending zoom — used on schema change to abort an in-flight fit. */
  cancelZoom: () => void;
};

/**
 * rAF-based camera-fit channel: a single-item pending request that
 * drains once React Flow has committed the latest layout.
 */
export function useSchemaViewerZoomMethods(
  instance: SchemaViewerInstance | null,
): SchemaViewerZoomMethods {
  const instanceRef = useRef(instance);
  instanceRef.current = instance;

  // Latest pending request — fresh writes overwrite the previous one, so
  // multiple zoom calls in the same tick collapse to the last one.
  const pendingRef = useRef<PendingFit | null>(null);
  const rafRef = useRef<number | null>(null);

  const drain = useCallback(() => {
    rafRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    const inst = instanceRef.current;
    if (pending == null || inst == null) {
      return;
    }
    if (pending.kind === "all") {
      inst.fitView({ duration: ZOOM_DURATION_MS });
    } else {
      zoomToNodes(inst, [pending.nodeId]);
    }
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current != null) {
      return;
    }
    rafRef.current = requestAnimationFrame(drain);
  }, [drain]);

  // If a request lands before the instance is captured, the rAF will see no
  // instance and bail. Re-drain when the instance arrives.
  useEffect(() => {
    if (instance != null && pendingRef.current != null) {
      schedule();
    }
  }, [instance, schedule]);

  const zoomToNode = useCallback(
    (nodeId: string) => {
      pendingRef.current = { kind: "node", nodeId };
      schedule();
    },
    [schedule],
  );

  const zoomToCanvas = useCallback(() => {
    pendingRef.current = { kind: "all" };
    schedule();
  }, [schedule]);

  const cancelZoom = useCallback(() => {
    pendingRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  return { zoomToNode, zoomToCanvas, cancelZoom };
}
