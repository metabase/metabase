import type {
  ComputedVisualizationSettings,
  HoveredObject,
} from "metabase/visualizations/types";

// Only the documented hover fields cross over, with the host's settings, so a plugin can't forge tooltip state.
export function toHostHoverObject(
  {
    index,
    seriesIndex,
    value,
    column,
    data,
    dimensions,
    element,
    event,
  }: HoveredObject,
  settings: ComputedVisualizationSettings,
): HoveredObject {
  return {
    index,
    seriesIndex,
    value,
    column,
    data,
    dimensions,
    element,
    event,
    settings,
  };
}
