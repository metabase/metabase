import type {
  CreateCustomVisualization,
  CustomVisualization,
} from "custom-viz";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import MetabaseSettings from "metabase/utils/settings";
import visualizations, { registerVisualization } from "metabase/visualizations";
import { formatValue as internalFormatValue } from "metabase/visualizations/lib/formatting/value";
import type { VisualizationDefinition } from "metabase/visualizations/types/visualization";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { customVizColumnTypes } from "metabase-lib/v1/types/utils/custom-viz-column-types";
import type {
  ColumnSettings,
  CustomVizPluginId,
  VisualizationDisplay,
} from "metabase-types/api";

import {
  brandSettingDefinition,
  toHostSettingsDefinitions,
} from "./custom-viz-settings";

type StaticVizApiWindow = Omit<Window, "__METABASE_VIZ_API__"> & {
  __METABASE_VIZ_API__?: Omit<
    NonNullable<Window["__METABASE_VIZ_API__"]>,
    // unsupported in static viz
    "measureText" | "measureTextHeight" | "measureTextWidth"
  >;
};

export const customVizRegistry: Map<
  VisualizationDisplay,
  CustomVisualization<Record<string, unknown>>
> = new Map();

// Mirrors custom-viz-utils' formatValue without importing that module.
function formatValue(value: unknown, options?: ColumnSettings): string {
  const result = internalFormatValue(value, { ...options, jsx: false });
  return String(result ?? "");
}

// The main registry entry is never rendered in the static bundle —
// CustomStaticVisualization takes the component from customVizRegistry. It
// only backs getVisualizationTransformed / getComputedSettingsForSeries, so a
// bare definition is all that needs registering.
function buildStaticVisualizationDefinition(
  vizDef: CustomVisualization<Record<string, unknown>>,
  identifier: VisualizationDisplay,
  getUiName: () => string,
): VisualizationDefinition {
  return {
    identifier,
    getUiName,
    // Icons never render in the headless static-viz (GraalJS) context;
    // "unknown" mirrors getIconForVisualizationType's fallback.
    iconName: "unknown",
    settings: toHostSettingsDefinitions(vizDef.settings),
    checkRenderable: vizDef.checkRenderable,
    minSize: vizDef.minSize,
    defaultSize: vizDef.defaultSize,
  };
}

export function registerCustomVizPlugin(
  factory: CreateCustomVisualization<Record<string, unknown>>,
  identifier: string,
  _pluginId: CustomVizPluginId,
) {
  // Text measurement is unavailable in the GraalJS context, so the API object
  // assigned here omits the measure-text functions the global Window
  // declaration includes. The cast narrows Window so the assignment type-checks.
  (window as StaticVizApiWindow).__METABASE_VIZ_API__ = {
    columnTypes: customVizColumnTypes,
    formatValue,
  };

  const locale = MetabaseSettings.get("site-locale") ?? "en";
  const vizDef = factory({
    defineSetting(definition) {
      return brandSettingDefinition(definition);
    },
    locale,
  });
  const display: VisualizationDisplay = `custom:${identifier}`;
  customVizRegistry.set(display, vizDef);

  // Guarded because re-registering a definition over a definition throws;
  // repeat registration (e.g. repeated GraalJS calls) must stay a no-op.
  if (!visualizations.has(display)) {
    registerVisualization(
      buildStaticVisualizationDefinition(vizDef, display, () => identifier),
    );
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
