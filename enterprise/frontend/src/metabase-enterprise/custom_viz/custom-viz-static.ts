import type {
  CreateCustomVisualization,
  CustomVisualization,
  CustomVisualizationSettingDefinition,
} from "custom-viz";

// Deep imports so the static-viz bundle doesn't pull in every plugin module.
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import MetabaseSettings from "metabase/utils/settings";
import visualizations, { registerVisualization } from "metabase/visualizations";
import { formatValue as internalFormatValue } from "metabase/visualizations/lib/formatting/value";
import type { Visualization } from "metabase/visualizations/types/visualization";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { customVizColumnTypes } from "metabase-lib/v1/types/utils/custom-viz-column-types";
import type {
  ColumnSettings,
  CustomVizPluginId,
  VisualizationDisplay,
} from "metabase-types/api";

import { applyDefaultVisualizationProps } from "./custom-viz-common";

type StaticVizApiWindow = Omit<Window, "__METABASE_VIZ_API__"> & {
  __METABASE_VIZ_API__?: Omit<
    NonNullable<Window["__METABASE_VIZ_API__"]>,
    // unsupported in static viz
    "measureText" | "measureTextHeight" | "measureTextWidth"
  >;
};

export const customVizRegistry: Map<
  string,
  CustomVisualization<Record<string, unknown>>
> = new Map();

// Mirrors custom-viz-utils' formatValue without importing that module.
function formatValue(value: unknown, options?: ColumnSettings): string {
  const result = internalFormatValue(value, { ...options, jsx: false });
  return String(result ?? "");
}

export function registerCustomVizPlugin(
  factory: CreateCustomVisualization<Record<string, unknown>>,
  identifier: string,
  pluginId: CustomVizPluginId,
) {
  // Plugin bundles read column types and value formatting from this global
  // lazily (see the custom-viz package). Text measurement is unavailable in
  // the GraalJS context — static components get it via renderingContext.
  (window as StaticVizApiWindow).__METABASE_VIZ_API__ = {
    columnTypes: customVizColumnTypes,
    formatValue,
  };

  const locale = MetabaseSettings.get("site-locale") ?? "en";
  const vizDef = factory({
    defineSetting(definition) {
      // Unjustified type cast. FIXME
      return definition as unknown as CustomVisualizationSettingDefinition<
        Record<string, unknown>
      >;
    },
    locale,
  });
  const display: VisualizationDisplay = `custom:${identifier}`;
  customVizRegistry.set(display, vizDef);

  // Register in main visualizations Map so getVisualizationRaw() resolves
  // the plugin's settings for getComputedSettingsForSeries()
  const Component = (vizDef.StaticVisualizationComponent ??
    (() => null)) as unknown as Visualization;
  applyDefaultVisualizationProps(Component, vizDef, {
    identifier: display,
    pluginId,
    getUiName: () => identifier,
  });
  if (!visualizations.has(display)) {
    registerVisualization(Component);
  }
}

export function applyCustomVizStaticOverride() {
  if (hasPremiumFeature("custom-viz")) {
    Object.assign(PLUGIN_CUSTOM_VIZ, {
      customVizRegistry,
      registerCustomVizPlugin,
    });
  }
}
