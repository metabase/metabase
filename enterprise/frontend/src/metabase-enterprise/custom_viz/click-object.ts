import type {
  ClickObject,
  ComputedVisualizationSettings,
} from "metabase/visualizations/types";

/**
 * Rebuild a plugin's click object from its documented fields, with the host's
 * settings in place of whatever the plugin supplied, so a plugin cannot forge
 * `click_behavior`.
 */
export function toHostClickObject(
  { value, column, dimensions, event, element, origin, data }: ClickObject,
  settings: ComputedVisualizationSettings,
): ClickObject {
  return { value, column, dimensions, event, element, origin, data, settings };
}
