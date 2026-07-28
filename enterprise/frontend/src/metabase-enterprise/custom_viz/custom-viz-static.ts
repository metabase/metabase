import type {
  CreateCustomVisualization,
  CustomVisualization,
} from "custom-viz";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import MetabaseSettings from "metabase/utils/settings";
import visualizations, { registerVisualization } from "metabase/visualizations";
import { formatValue as internalFormatValue } from "metabase/visualizations/lib/formatting/value";
import type {
  StaticCustomVisualization,
  Visualization,
} from "metabase/visualizations/types/visualization";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { customVizColumnTypes } from "metabase-lib/v1/types/utils/custom-viz-column-types";
import type {
  ColumnSettings,
  CustomVizPluginId,
  VisualizationDisplay,
} from "metabase-types/api";

import { brandSettingDefinition } from "./custom-viz-settings";

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

function applyStaticVisualizationProps(
  vizDef: CustomVisualization<Record<string, unknown>>,
  props: {
    identifier: VisualizationDisplay;
    pluginId: CustomVizPluginId;
    getUiName: () => string;
  },
): StaticCustomVisualization {
  const Component = vizDef.StaticVisualizationComponent ?? (() => null);
  Object.assign(Component, {
    settings: vizDef.settings ?? {},
    checkRenderable: vizDef.checkRenderable,
    minSize: vizDef.minSize,
    defaultSize: vizDef.defaultSize,
    ...props,
  } satisfies Partial<Record<keyof Visualization, unknown>>);
  return Component;
}

export function registerCustomVizPlugin(
  factory: CreateCustomVisualization<Record<string, unknown>>,
  identifier: string,
  pluginId: CustomVizPluginId,
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

  const Component = applyStaticVisualizationProps(vizDef, {
    identifier: display,
    pluginId,
    getUiName: () => identifier,
  });
  if (!visualizations.has(display)) {
    // TO IMPROVE: The registry accepts later down the line only Visualization components, so the cast is necessary to satisfy the type-checker.
    // Static viz components might not need registration at all.
    registerVisualization(Component as unknown as Visualization);
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
