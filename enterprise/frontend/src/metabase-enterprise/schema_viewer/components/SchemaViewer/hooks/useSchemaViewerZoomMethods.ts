import type { ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import { zoomToNodes } from "../utils/zoom";

const ZOOM_DURATION_MS = 500;

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
 * rAF-coalesced camera-fit channel: a single-cell pending request that
 * drains once React Flow has committed the latest layout. Returns stable
 * method references so callers can pass them around or memoize without
 * churn.
 *
 * The React Flow instance is captured by the caller (typically via
 * `<ReactFlow onInit={setInstance}>`) and passed in here. It may be `null`
 * during the first render — any zoom requested before the instance arrives
 * is held in a ref and drained as soon as it does.
 */
export function useSchemaViewerZoomMethods(
  instance: SchemaViewerInstance | null,
): SchemaViewerZoomMethods {
  // Mirror in a ref so the drain closure always sees the latest instance
  // without needing to be re-created on every capture.
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
