import type {
  ClickObject,
  ComputedVisualizationSettings,
} from "metabase/visualizations/types";

// Only the documented click fields cross over, with the host's settings, so a plugin cannot forge `click_behavior`.
export function toHostClickObject(
  { value, column, dimensions, event, element, origin, data }: ClickObject,
  settings: ComputedVisualizationSettings,
): ClickObject {
  return { value, column, dimensions, event, element, origin, data, settings };
}
