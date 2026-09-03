import type { CustomVisualization } from "custom-viz";
import type { ComponentType } from "react";

import type {
  Visualization,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import { columnSettings } from "metabase/viz-core";
import type {
  CustomVizDisplayType,
  CustomVizPluginRuntime,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { sanitizePluginSettings } from "./custom-viz-settings";
import { toPluginSeries, toPluginSettings } from "./plugin-view";

/**
 * Assign properties derived from a vizDef onto a Visualization component
 * and merge in caller-specific overrides.
 *
 * `vizDef.settings` arrives as a near-membrane proxy from the plugin
 * sandbox. Before the host visualization layer can read setting widget
 * values, every function-shaped `widget` must be re-wrapped in a
 * host-allocated `WidgetMount`. Because the host always allocates this
 * wrapper itself, its plugin-id marker is host-controlled by construction —
 * letting the host later distinguish mount-driven widgets from plain React
 * components.
 */
export function applyDefaultVisualizationProps(
  Component: ComponentType<VisualizationProps & VisualizationPassThroughProps>,
  vizDef: CustomVisualization<Record<string, unknown>>,
  settings: {
    identifier: CustomVizDisplayType;
    plugin: CustomVizPluginRuntime;
    prefix: string;
    getUiName: () => string;
    iconUrl?: string | undefined;
    isDev?: boolean;
  },
): Visualization {
  const { plugin, prefix, ...componentSettings } = settings;
  return Object.assign(Component, {
    settings: {
      ...columnSettings({ getHidden: () => true }),
      ...sanitizePluginSettings(vizDef.settings, {
        prefix,
        mount: vizDef.mount,
        plugin,
      }),
    },
    checkRenderable: (series: Series, vizSettings: VisualizationSettings) => {
      if (typeof vizDef.checkRenderable === "function") {
        vizDef.checkRenderable(
          toPluginSeries(series, prefix),
          toPluginSettings(vizSettings, prefix),
        );
      }
    },
    noHeader: vizDef.noHeader ?? false,
    canSavePng: vizDef.canSavePng ?? false,
    hidden: false,
    minSize: vizDef.minSize,
    defaultSize: vizDef.defaultSize,
    isDev: settings.isDev,
    pluginId: plugin.id,
    ...componentSettings,
  });
}
