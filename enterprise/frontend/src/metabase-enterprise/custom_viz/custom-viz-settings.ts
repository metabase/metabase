import type {
  CustomVisualization,
  CustomVisualizationMount,
  CustomVisualizationSettingDefinition,
  ReservedVisualizationSettingId,
  Widgets,
} from "custom-viz";
import type { ComponentType } from "react";
import { t } from "ttag";

import type { CustomVizPluginId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { wrapPluginWidget } from "./widget-mount";

const RESERVED_SETTING_IDS: ReadonlySet<string> = new Set(
  Object.keys({
    column: true,
    column_settings: true,
  } satisfies Record<ReservedVisualizationSettingId, true>),
);

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

  assertValidSettingWidgets(settings);

  const sanitizedSettings: CustomVisualization<
    Record<string, unknown>
  >["settings"] = {};

  for (const [settingId, value] of Object.entries(settings)) {
    if (RESERVED_SETTING_IDS.has(settingId)) {
      console.warn(
        `Custom viz setting "${settingId}" uses a reserved id and was ignored.`,
      );
      continue;
    }

    if (!isObject(value)) {
      // settings definitions should be objects
      continue;
    }

    if ("widget" in value && typeof value.widget === "function") {
      // Unjustified type cast. FIXME
      const Widget = value.widget as ComponentType<Record<string, unknown>>;
      // Unjustified type cast. FIXME
      sanitizedSettings[settingId] = {
        ...value,
        widget: wrapPluginWidget(
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

const ALLOWED_WIDGET_NAMES: Array<keyof Widgets> = [
  "input",
  "number",
  "radio",
  "select",
  "toggle",
  "segmentedControl",
  "field",
  "fields",
  "color",
  "multiselect",
] as const;

function assertValidSettingWidgets(
  settings: CustomVisualization<Record<string, unknown>>["settings"],
): void {
  if (!settings) {
    return;
  }
  for (const [settingId, def] of Object.entries(settings)) {
    // Unjustified type cast. FIXME
    const widget = (def as { widget?: unknown }).widget;
    if (
      typeof widget === "string" &&
      !ALLOWED_WIDGET_NAMES.some((w) => w === widget)
    ) {
      throw new Error(
        t`Setting "${settingId}" has unsupported widget ${widget}. Use one of: ${ALLOWED_WIDGET_NAMES.join(", ")}.`,
      );
    }
  }
}
