import type {
  ComputedVisualizationSettings,
  HoveredObject,
} from "metabase/visualizations/types";

// Only the documented hover fields cross over, with the host's settings.
export function toHostHoverObject(
  hoverObject: HoveredObject,
  settings: ComputedVisualizationSettings,
): HoveredObject {
  return {
    index: hoverObject.index,
    seriesIndex: hoverObject.seriesIndex,
    value: hoverObject.value,
    column: hoverObject.column,
    data: hoverObject.data,
    dimensions: hoverObject.dimensions,
    element: hoverObject.element,
    event: hoverObject.event,
    settings,
  };
}
