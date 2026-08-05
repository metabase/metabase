import type { CustomVisualization } from "custom-viz";
import type { ComponentType } from "react";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import type {
  Visualization,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import type {
  CustomVizPluginRuntime,
  DatasetData,
  VisualizationDisplay,
} from "metabase-types/api";

import { sanitizePluginSettings } from "./custom-viz-settings";

/**
 * A plugin that doesn't declare `isSensible` is sensible for any data —
 * otherwise the host swaps the user's choice for a default visualization the
 * next time the question is re-run, e.g. after a drill-through (GDGT-2286).
 *
 * The plugin's own function runs behind the sandbox membrane and is called
 * while a query completes, where a throw would take down the query builder.
 */
function getIsSensible(
  isSensible: CustomVisualization<Record<string, unknown>>["isSensible"],
): NonNullable<Visualization["isSensible"]> {
  if (!isSensible) {
    return () => true;
  }

  return (data: DatasetData) => {
    try {
      return isSensible(data);
    } catch (error) {
      console.error("Custom visualization `isSensible` threw:", error);
      return true;
    }
  };
}

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
    identifier: VisualizationDisplay;
    plugin: CustomVizPluginRuntime;
    getUiName: () => string;
    iconUrl?: string | undefined;
    isDev?: boolean;
  },
): Visualization {
  const { plugin, ...componentSettings } = settings;
  return Object.assign(Component, {
    settings: {
      ...columnSettings({ getHidden: () => true }),
      ...sanitizePluginSettings(vizDef.settings, vizDef.mount, plugin),
    },
    checkRenderable: vizDef.checkRenderable,
    isSensible: getIsSensible(vizDef.isSensible),
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
