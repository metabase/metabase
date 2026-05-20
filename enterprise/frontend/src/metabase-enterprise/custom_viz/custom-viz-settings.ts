import type {
  CustomVisualization,
  CustomVisualizationMount,
  CustomVisualizationSettingDefinition,
} from "custom-viz";
import type { ComponentType } from "react";

import type { CustomVizPluginId } from "metabase-types/api";

import { stampPluginWidget } from "./widget-mount";

/**
 * Walk a plugin's `vizDef.settings` and rewrite every Component-shaped
 * `widget` into a host-trusted `WidgetMount` whose body delegates to the
 * plugin's shared `mount` function (i.e., its sandbox-side `createRoot`
 * render path). Built-in `WidgetName` strings pass through unchanged.
 */
export function sanitizePluginSettings(
  settings:
    | CustomVisualization<Record<string, unknown>>["settings"]
    | undefined,
  mount: CustomVisualizationMount,
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
      const Widget = value.widget as ComponentType<Record<string, unknown>>;
      sanitizedSettings[settingId] = {
        ...value,
        widget: stampPluginWidget(
          (container, initialProps) => mount(Widget, container, initialProps),
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
