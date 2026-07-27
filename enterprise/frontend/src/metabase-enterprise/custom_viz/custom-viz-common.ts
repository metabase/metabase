import type { CustomVisualization } from "custom-viz";
import type { ComponentType } from "react";

import type {
  Visualization,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import type {
  CustomVizPluginId,
  VisualizationDisplay,
} from "metabase-types/api";

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
  Component: ComponentType<VisualizationProps & VisualizationPassThroughProps>,
  vizDef: CustomVisualization<Record<string, unknown>>,
  settings: {
    identifier: VisualizationDisplay;
    pluginId: CustomVizPluginId;
    getUiName: () => string;
    iconUrl?: string | undefined;
    isDev?: boolean;
  },
): Visualization {
  return Object.assign(Component, {
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
    // custom visualizations render their icon through `iconUrl`; "unknown"
    // mirrors the fallback consumers use when no iconName is registered
    iconName: "unknown" as const,
    ...settings,
  });
}
