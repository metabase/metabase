import type { HoverObject as PluginHoverObject } from "custom-viz";

import type {
  ComputedVisualizationSettings,
  HoveredObject,
} from "metabase/visualizations/types";

export type { PluginHoverObject };

export function toHostHoverObject(
  hoverObject: PluginHoverObject,
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
