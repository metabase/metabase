import type {
  CustomVisualization,
  CustomVisualizationSettingDefinition,
  WidgetMount,
} from "custom-viz";

import type { CustomVizPluginId } from "metabase-types/api";

import { stampPluginWidget } from "./widget-mount";

/**
 * Walk a plugin's `vizDef.settings` and replace every function-shaped
 * widget with a host-trusted `WidgetMount` allocated by the host. Built-in
 * `WidgetName` strings pass through unchanged.
 */
export function sanitizePluginSettings(
  settings:
    | CustomVisualization<Record<string, unknown>>["settings"]
    | undefined,
  pluginId: CustomVizPluginId,
): CustomVisualization<Record<string, unknown>>["settings"] {
  if (!settings) {
    return settings;
  }
  const sanitizedSettings: CustomVisualization<
    Record<string, unknown>
  >["settings"] = {};

  for (const [settingId, value] of Object.entries(settings)) {
    if (!value || typeof value !== "object") {
      sanitizedSettings[settingId] = value;
      continue;
    }

    if ("widget" in value && typeof value.widget === "function") {
      sanitizedSettings[settingId] = {
        ...value,
        widget: stampPluginWidget(
          value.widget as unknown as WidgetMount,
          pluginId,
        ),
      } as unknown as CustomVisualizationSettingDefinition<
        Record<string, unknown>
      >;
    } else {
      sanitizedSettings[settingId] = value;
    }
  }
  return sanitizedSettings;
}
