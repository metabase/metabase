import type { DragEndEvent } from "@dnd-kit/core";
import { useCallback } from "react";

import type { ExplorationMetric } from "metabase/explorations/types";
import type { MetricDimension, Timeline } from "metabase-types/api";

import type {
  ExplorationSelection,
  ToggleDimensionContext,
  ToggleMetricContext,
} from "./useExplorationSelection";

export const RESEARCH_PLAN_EMPTY_DROPPABLE_ID = "research-plan-empty";
export const RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID = "research-plan-new-block";
export const RESEARCH_PLAN_TIMELINE_DROPPABLE_ID = "research-plan-timelines";

const NEW_BLOCK_DROPPABLE_IDS: ReadonlySet<string> = new Set([
  RESEARCH_PLAN_EMPTY_DROPPABLE_ID,
  RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID,
]);

export function isNewBlockDroppableId(dropId: string | number): boolean {
  return typeof dropId === "string" && NEW_BLOCK_DROPPABLE_IDS.has(dropId);
}

export type ExplorationDragKind = "metric" | "dimension" | "timeline";

export interface MetricDragData {
  kind: "metric";
  payload: ExplorationMetric;
  context: ToggleMetricContext;
}

export interface DimensionDragData {
  kind: "dimension";
  payload: MetricDimension;
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

      if (
        over.id === RESEARCH_PLAN_TIMELINE_DROPPABLE_ID &&
        data.kind !== "timeline"
      ) {
        return;
      }

      if (data.kind === "timeline") {
        if (over.id === RESEARCH_PLAN_TIMELINE_DROPPABLE_ID) {
          addTimelinesById([data.payload.id]);
        }
        return;
      }

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

export function isExplorationDropAccepted(
  blockKind: "metric" | "dimension",
  dragKind: ExplorationDragKind,
): boolean {
  return (
    (blockKind === "metric" && dragKind === "dimension") ||
    (blockKind === "dimension" && dragKind === "metric")
  );
}
