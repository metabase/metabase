import type { DragEndEvent } from "@dnd-kit/core";
import { useCallback } from "react";

import type { ExplorationMetric } from "metabase/explorations/types";
import type { MetricDimension, Timeline } from "metabase-types/api";

import type {
  ExplorationSelection,
  ToggleDimensionContext,
  ToggleMetricContext,
} from "./useExplorationSelection";

/**
 * Stable drop-target id for the Research plan's empty state placeholder
 * (rendered when the plan has no blocks yet).
 *
 * `RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID` is the analogous target that
 * appears *below* the existing blocks once the plan is non-empty —
 * dropping on either id has the same effect (create a new block
 * hydrated from the drag's `context`). dnd-kit requires unique ids for
 * coexisting droppables, so we declare both and check both in
 * `handleDragEnd`.
 */
export const RESEARCH_PLAN_EMPTY_DROPPABLE_ID = "research-plan-empty";
export const RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID = "research-plan-new-block";

/**
 * Drop-target id for the "Selected timelines" list above the "Begin
 * research" button. Dragging a timeline row from the Browse → Timelines
 * panel onto this target adds it to the global timeline selection (the
 * same effect as ticking the row's checkbox). Metric/dimension drags
 * here are ignored — timelines are a separate, non-block selection.
 */
export const RESEARCH_PLAN_TIMELINE_DROPPABLE_ID = "research-plan-timelines";

const NEW_BLOCK_DROPPABLE_IDS: ReadonlySet<string> = new Set([
  RESEARCH_PLAN_EMPTY_DROPPABLE_ID,
  RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID,
]);

/** True if dropping on `dropId` should create a new block. */
export function isNewBlockDroppableId(dropId: string | number): boolean {
  return typeof dropId === "string" && NEW_BLOCK_DROPPABLE_IDS.has(dropId);
}

/**
 * Drag-and-drop wiring for "drag a Browse picker item into a Research
 * plan block". Encapsulates the id convention so call sites don't have
 * to invent string formats:
 *
 * - **Draggable** ids in the Browse pickers are
 *   `palette:metric:${metric.id}` and `palette:dim:${dimension.id}`.
 * - **Droppable** ids in the Research plan match the block id
 *   (`metric:${id}` / `dim:${id}`) so the drop target reads naturally
 *   from `block.id` without a prefix shim.
 *
 * The `data` payload carries the actual entity so the drop handler
 * can call the right selection mutator without re-fetching.
 *
 * Cross-kind only: dropping a dimension onto a dimension block, or a
 * metric onto a metric block, is a no-op (we don't want a metric block
 * to mutate its primary metric, or a dimension block to swap its
 * primary dimension via drag — those flows belong to the picker
 * checkboxes).
 */
export type ExplorationDragKind = "metric" | "dimension" | "timeline";

export interface MetricDragData {
  kind: "metric";
  payload: ExplorationMetric;
  /**
   * Context the selection hook needs to materialize a metric block —
   * pre-populating it with the metric's interesting dimensions. Passed
   * through here so a drop onto the Research plan's empty-state target
   * (which creates a fresh block) reproduces the click-the-checkbox
   * behavior. For drops onto an existing block this context is unused.
   */
  context: ToggleMetricContext;
}

export interface DimensionDragData {
  kind: "dimension";
  payload: MetricDimension;
  /**
   * Context the selection hook needs to materialize a dimension block —
   * pre-populating it with the group's sibling dimensions and the
   * metrics that reference them. Same rationale as `MetricDragData.context`.
   */
  context: ToggleDimensionContext;
}

export interface TimelineDragData {
  kind: "timeline";
  payload: Timeline;
}

export type ExplorationDragData =
  | MetricDragData
  | DimensionDragData
  | TimelineDragData;

export function paletteMetricDragId(metricId: ExplorationMetric["id"]): string {
  return `palette:metric:${metricId}`;
}

export function paletteDimensionDragId(dimensionId: string): string {
  return `palette:dim:${dimensionId}`;
}

export function paletteTimelineDragId(timelineId: Timeline["id"]): string {
  return `palette:timeline:${timelineId}`;
}

export interface UseExplorationDndResult {
  handleDragEnd: (event: DragEndEvent) => void;
}

/**
 * Top-level `onDragEnd` handler used by the page's `DndContext`. Routes
 * the dropped entity to the right `selection` mutator based on the
 * source kind + target block kind. Invalid combinations (same-kind
 * drops, drops outside any block) are silently ignored.
 */
export function useExplorationDnd(
  selection: ExplorationSelection,
): UseExplorationDndResult {
  const {
    addDimensionToMetricBlock,
    addMetricToDimensionBlock,
    addMetric,
    toggleDimension,
    addTimelinesById,
    blocks,
  } = selection;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over == null) {
        return;
      }
      const data = active.data.current as ExplorationDragData | undefined;
      if (data == null) {
        return;
      }

      // Metric/dimension drags onto the timeline tray are meaningless —
      // ignore them.
      if (
        over.id === RESEARCH_PLAN_TIMELINE_DROPPABLE_ID &&
        data.kind !== "timeline"
      ) {
        return;
      }

      // A timeline is a separate, exploration-wide selection that's
      // completely detached from the metric/dimension block model. It
      // only lands on the dedicated timeline tray — which is always
      // present (as a drop target) while a timeline drag is in flight.
      // Dropped anywhere else (a block, the empty-state placeholder, the
      // trailing new-block zone) it's a no-op.
      if (data.kind === "timeline") {
        if (over.id === RESEARCH_PLAN_TIMELINE_DROPPABLE_ID) {
          addTimelinesById([data.payload.id]);
        }
        return;
      }

      // Special-case the "create new block" targets — the empty-state
      // placeholder (only rendered when there are no blocks yet) and
      // the trailing drop area below the existing blocks. Both
      // produce a brand new block hydrated with the same context the
      // checkbox click would use.
      if (isNewBlockDroppableId(over.id)) {
        if (data.kind === "metric") {
          addMetric(data.payload, data.context);
        } else {
          toggleDimension(data.payload, data.context);
        }
        return;
      }

      const targetBlock = blocks.find((b) => b.id === over.id);
      if (targetBlock == null) {
        return;
      }
      if (data.kind === "dimension" && targetBlock.kind === "metric") {
        addDimensionToMetricBlock(targetBlock.id, data.payload);
      } else if (data.kind === "metric" && targetBlock.kind === "dimension") {
        addMetricToDimensionBlock(targetBlock.id, data.payload);
      }
      // All other combinations (metric → metric block, dim → dim
      // block, anything → outside a block) are no-ops by design.
    },
    [
      addDimensionToMetricBlock,
      addMetricToDimensionBlock,
      addMetric,
      toggleDimension,
      addTimelinesById,
      blocks,
    ],
  );

  return { handleDragEnd };
}

/**
 * For a given drop-target block (its `kind`), report whether a drag
 * payload of `kind` would be accepted. Pure — UI components call this
 * to compute hover-state colors without duplicating the routing rule.
 */
export function isExplorationDropAccepted(
  blockKind: "metric" | "dimension",
  dragKind: ExplorationDragKind,
): boolean {
  return (
    (blockKind === "metric" && dragKind === "dimension") ||
    (blockKind === "dimension" && dragKind === "metric")
  );
}
