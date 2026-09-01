import type { ClickObject as PluginClickObject } from "custom-viz";

import type {
  ClickObject,
  ComputedVisualizationSettings,
} from "metabase/visualizations/types";

export type { PluginClickObject };

export function toHostClickObject(
  clickObject: PluginClickObject,
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
