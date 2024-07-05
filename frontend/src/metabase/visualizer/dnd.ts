import type { DragEndEvent } from "@dnd-kit/core";

import type { VisualizationSettings } from "metabase-types/api";

export const DROPPABLE_CANVAS_ID = "visualizer-canvas";
export const DRAGGABLE_ACTIVE_METRIC_TYPE = "active-metric";
export const DRAGGABLE_ACTIVE_DIMENSION_TYPE = "active-dimension";

export function handleDragEnd(
  { active, over }: DragEndEvent,
  settings: VisualizationSettings,
): VisualizationSettings {
  const isDraggingActiveMetric =
    active?.data?.current?.type === DRAGGABLE_ACTIVE_METRIC_TYPE;
  const isDraggingActiveDimension =
    active?.data?.current?.type === DRAGGABLE_ACTIVE_DIMENSION_TYPE;
  const isOverCanvas = over?.id === DROPPABLE_CANVAS_ID;

  if (isOverCanvas) {
    const metrics = settings["graph.metrics"] || [];
    const dimensions = settings["graph.dimensions"] || [];

    if (isDraggingActiveMetric && metrics.length > 1) {
      const metricName = active.data?.current?.column;
      return {
        ...settings,
        "graph.metrics": metrics.filter(metric => metric !== metricName),
      };
    }

    if (isDraggingActiveDimension && dimensions.length > 1) {
      const dimensionName = active.data?.current?.column;
      return {
        ...settings,
        "graph.dimensions": dimensions.filter(
          dimension => dimension !== dimensionName,
        ),
      };
    }
  }

  return settings;
}
