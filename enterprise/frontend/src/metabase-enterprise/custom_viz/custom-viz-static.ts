import type {
  CreateCustomVisualization,
  CustomVisualization,
} from "custom-viz";
import { type ComponentProps, createElement } from "react";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import MetabaseSettings from "metabase/utils/settings";
import { formatValue as internalFormatValue } from "metabase/value-formatting";
import {
  getCustomVizSettingKeyPrefix,
  registerVisualization,
  visualizations,
} from "metabase/viz-core";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type {
  ColumnSettings,
  CustomVizDisplayType,
  CustomVizPluginId,
  CustomVizPluginRuntime,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { customVizColumnTypes } from "./custom-viz-column-types";
import { applyDefaultVisualizationProps } from "./custom-viz-common";
import { brandSettingDefinition } from "./custom-viz-settings";
import { toPluginSeries, toPluginSettings } from "./plugin-view";

type StaticVizApiWindow = Omit<Window, "__METABASE_VIZ_API__"> & {
  __METABASE_VIZ_API__?: Omit<
    NonNullable<Window["__METABASE_VIZ_API__"]>,
    // unsupported in static viz
    "measureText" | "measureTextHeight" | "measureTextWidth"
  >;
};

type GenericVizDefinition = CustomVisualization<Record<string, unknown>>;

type StaticComponent = NonNullable<
  GenericVizDefinition["StaticVisualizationComponent"]
>;

/**
 * What `CustomStaticVisualization` passes to the registry's static component:
 * the host's series and computed (namespaced) settings, which the wrapper
 * below turns into the plugin's own view.
 */
type HostStaticProps = Omit<
  ComponentProps<StaticComponent>,
  "series" | "settings"
> & {
  series: Series;
  settings: VisualizationSettings;
};

export const customVizRegistry: Map<
  CustomVizDisplayType,
  GenericVizDefinition
> = new Map();

// Mirrors custom-viz-utils' formatValue without importing that module.
function formatValue(value: unknown, options?: ColumnSettings): string {
  const result = internalFormatValue(value, { ...options, jsx: false });
  return String(result ?? "");
}

/**
 * The GraalJS context only receives the plugin's identifier and id. The
 * remaining runtime fields drive host-only behavior (asset urls, dev reloads,
 * widget mounts), so the static definition registers with a record carrying
 * just what the definition props read: the id and the display name fallback.
 */
function toStaticPluginRuntime(
  identifier: string,
  pluginId: CustomVizPluginId,
): CustomVizPluginRuntime {
  return {
    id: pluginId,
    identifier,
    display_name: identifier,
    icon: null,
    bundle_url: "",
    warnings: [],
  };
}

function toHostStaticComponent(
  vizDef: GenericVizDefinition,
  prefix: string,
): GenericVizDefinition["StaticVisualizationComponent"] {
  const { StaticVisualizationComponent } = vizDef;
  if (!StaticVisualizationComponent) {
    return undefined;
  }

  const HostStaticVisualization = ({
    series,
    settings,
    ...props
  }: HostStaticProps) =>
    createElement(StaticVisualizationComponent, {
      ...props,
      series: toPluginSeries(series, prefix),
      settings: toPluginSettings(settings, prefix),
    });

  // The registry is typed with the plugin-facing props; the host hands the
  // component its own series and settings instead (see HostStaticProps).
  return HostStaticVisualization as unknown as StaticComponent;
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
  const display: CustomVizDisplayType = `custom:${identifier}`;
  const prefix = getCustomVizSettingKeyPrefix(display);
  customVizRegistry.set(display, {
    ...vizDef,
    StaticVisualizationComponent: toHostStaticComponent(vizDef, prefix),
  });

  // Static rendering never mounts the registered component: the registry entry
  // only carries the definition props (namespaced settings, checkRenderable,
  // sizes) that computing a card's settings reads. A fresh function per
  // registration keeps a re-registered plugin from inheriting stale props.
  const Component = applyDefaultVisualizationProps(() => null, vizDef, {
    identifier: display,
    prefix,
    plugin: toStaticPluginRuntime(identifier, pluginId),
  });

  // Use registerVisualization for first load; overwrite directly for updates
  // (registerVisualization throws on duplicate identifiers).
  if (visualizations.has(display)) {
    visualizations.set(display, Component);
  } else {
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
