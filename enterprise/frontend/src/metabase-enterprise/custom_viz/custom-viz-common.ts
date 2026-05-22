import type { CustomVisualization } from "custom-viz";

import type { Visualization } from "metabase/visualizations/types/visualization";
import type { CustomVizPluginId } from "metabase-types/api";

import { sanitizePluginSettings } from "./custom-viz-settings";

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
  Component: Visualization,
  vizDef: CustomVisualization<Record<string, unknown>>,
  settings: {
    identifier: string;
    pluginId: CustomVizPluginId;
    getUiName: () => string;
    iconUrl?: string | undefined;
    isDev?: boolean;
  },
) {
  Object.assign(Component, {
    settings:
      sanitizePluginSettings(
        vizDef.settings,
        vizDef.mount,
        settings.pluginId,
      ) ?? {},
    checkRenderable: vizDef.checkRenderable,
    noHeader: vizDef.noHeader ?? false,
    canSavePng: vizDef.canSavePng ?? false,
    hidden: false,
    minSize: vizDef.minSize,
    defaultSize: vizDef.defaultSize,
    isDev: settings.isDev,
    ...settings,
  } satisfies Partial<Record<keyof Visualization, unknown>>);
}
