import { useReactFlow } from "@xyflow/react";
import { useEffect } from "react";

type FitToCanvasTrigger = { duration?: number } | null;

type FitToCanvasProps = {
  /**
   * A new (non-null) reference whenever a fresh full-canvas layout has just
   * been applied. Each new value triggers one `fitView()` call. Optional
   * `duration` animates the camera transition. `null` means "no pending
   * fit".
   */
  trigger: FitToCanvasTrigger;
  onDone: () => void;
};

/**
 * Fits the whole canvas via React Flow's `fitView()` whenever `trigger`
 * changes to a non-null value. Used for fresh-layout cases (first load,
 * schema switch, manual auto-layout) where the camera should zoom to
 * encompass all newly positioned nodes — using ReactFlow's component-level
 * zoom bounds rather than the per-node-fit floor that {@link FitToNewNodes}
 * enforces.
 */
export function FitToCanvas({ trigger, onDone }: FitToCanvasProps) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (trigger == null) {
      return;
    }
    // requestAnimationFrame to let React Flow commit the new node positions
    // before we compute viewport bounds.
    const handle = requestAnimationFrame(() => {
      fitView(
        trigger.duration != null ? { duration: trigger.duration } : undefined,
      );
      onDone();
    });
    return () => cancelAnimationFrame(handle);
  }, [trigger, fitView, onDone]);
  return null;
}
