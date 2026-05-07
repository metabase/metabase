import type { ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import { ZOOM_DURATION_MS, zoomToNodes } from "../utils/zoom";

type PendingFit =
  | { kind: "all" }
  | { kind: "node"; nodeId: string; retriesLeft: number };

// When `setNodes` and `zoomToNode` fire in the same useEffect, the ReactFlow
// store may not yet have the new node by the time the first rAF fires —
// `instance.getNodes()` returns the previous set, the zoom is a no-op, and
// the camera stays put. Retry across a few frames so the zoom lands once
// the store has caught up.
const NODE_ZOOM_MAX_RETRIES = 8;

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

  // `schedule` and `drain` reference each other — declare `schedule` via ref
  // so `drain` can re-arm the rAF after a missed-target retry without a
  // dependency cycle.
  const scheduleRef = useRef<() => void>(() => {});

  const drain = useCallback(() => {
    rafRef.current = null;
    const pending = pendingRef.current;
    const inst = instanceRef.current;
    if (pending == null || inst == null) {
      pendingRef.current = null;
      return;
    }
    if (pending.kind === "all") {
      pendingRef.current = null;
      inst.fitView({ duration: ZOOM_DURATION_MS });
      return;
    }
    const succeeded = zoomToNodes(inst, [pending.nodeId]);
    if (succeeded) {
      pendingRef.current = null;
      return;
    }
    // Target node not yet in the ReactFlow store — try again next frame
    // (up to NODE_ZOOM_MAX_RETRIES) so the camera still lands on it once
    // the store sync catches up.
    if (pending.retriesLeft > 0) {
      pendingRef.current = { ...pending, retriesLeft: pending.retriesLeft - 1 };
      scheduleRef.current();
      return;
    }
    pendingRef.current = null;
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current != null) {
      return;
    }
    rafRef.current = requestAnimationFrame(drain);
  }, [drain]);

  scheduleRef.current = schedule;

  // If a request lands before the instance is captured, the rAF will see no
  // instance and bail. Re-drain when the instance arrives.
  useEffect(() => {
    if (instance != null && pendingRef.current != null) {
      schedule();
    }
  }, [instance, schedule]);

  const zoomToNode = useCallback(
    (nodeId: string) => {
      pendingRef.current = {
        kind: "node",
        nodeId,
        retriesLeft: NODE_ZOOM_MAX_RETRIES,
      };
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
