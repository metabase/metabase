import type {
  ClickObject,
  ComputedVisualizationSettings,
} from "metabase/visualizations/types";

export function toHostClickObject(
  clickObject: ClickObject,
  settings: ComputedVisualizationSettings,
): ClickObject {
  return {
    value: clickObject.value,
    column: clickObject.column,
    dimensions: clickObject.dimensions,
    event: clickObject.event,
    element: clickObject.element,
    origin: clickObject.origin,
    data: clickObject.data,
    settings,
  };
}
