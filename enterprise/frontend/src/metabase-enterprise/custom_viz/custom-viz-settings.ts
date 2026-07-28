import type {
  CustomVisualization,
  CustomVisualizationMount,
  CustomVisualizationSettingDefinition,
  Widgets,
} from "custom-viz";
import type { ComponentType } from "react";
import { t } from "ttag";

import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";
import type { CustomVizPluginId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { wrapPluginWidget } from "./widget-mount";

/**
 * Mint the opaque `CustomVisualizationSettingDefinition` brand.
 *
 * The brand is a type-level-only unique symbol (`SettingDefinitionSymbol` in
 * the custom-viz package) that forces plugin authors to go through
 * `defineSetting` instead of hand-crafting setting definitions. No runtime
 * value can satisfy it, so the host mints the brand with this one deliberate
 * cast; keep every brand-minting site going through this helper.
 */
export function brandSettingDefinition(
  definition: unknown,
): CustomVisualizationSettingDefinition<Record<string, unknown>> {
  // The brand symbol exists only at the type level — see the doc comment.
  return definition as CustomVisualizationSettingDefinition<
    Record<string, unknown>
  >;
}

/**
 * The inverse boundary of `brandSettingDefinition`: strip the opaque brand so
 * the host can hand a plugin's setting definitions to its own settings
 * machinery. The brand is type-level only — at runtime these are the plain
 * setting-definition objects `getComputedSettings` consumes.
 */
export function toHostSettingsDefinitions(
  settings:
    | CustomVisualization<Record<string, unknown>>["settings"]
    | undefined,
): VisualizationSettingsDefinitions {
  // The brand symbol exists only at the type level — see the doc comment.
  return (settings ?? {}) as VisualizationSettingsDefinitions;
}

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
    if (!isObject(value)) {
      // settings definitions should be objects
      continue;
    }

    if ("widget" in value && typeof value.widget === "function") {
      // typeof narrowing only gets us to Function; a function-shaped widget is
      // a React component by the plugin API contract.
      const Widget = value.widget as ComponentType<Record<string, unknown>>;
      sanitizedSettings[settingId] = brandSettingDefinition({
        ...value,
        widget: wrapPluginWidget(
          (container, initialProps) => mount(Widget, container, initialProps),
          pluginId,
        ),
      });
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
