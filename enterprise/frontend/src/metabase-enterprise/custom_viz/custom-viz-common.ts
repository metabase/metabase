import type { CustomVisualization, WidgetMount } from "custom-viz";

import type { Visualization } from "metabase/visualizations/types/visualization";
import type { CustomVizPluginId } from "metabase-types/api";

import { stampPluginWidget } from "./widget-mount";

/**
 * Assign properties derived from a vizDef onto a Visualization component
 * and merge in caller-specific overrides.
 *
 * `vizDef.settings` arrives as a near-membrane proxy from the plugin
 * sandbox. Before the host visualization layer can read setting widget
 * values, every function-shaped `widget` must be re-wrapped in a
 * host-allocated `WidgetMount` so the host can later distinguish
 * mount-driven widgets from plain React components without trusting
 * plugin-controlled brands.
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
    settings: sanitizePluginSettings(vizDef.settings, settings.pluginId) ?? {},
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

/**
 * Walk a plugin's `vizDef.settings` map at the host/sandbox boundary and
 * normalize each setting's `widget` field:
 *
 *   - `string`  (built-in `WidgetName`) — pass through unchanged.
 *   - `function` — wrap in a host-allocated trusted mount via
 *     `wrapPluginWidget`. After this point, only host-trusted mount
 *     handles can pass `isTrustedWidgetMount`, so a plugin cannot smuggle a
 *     React component through and have it rendered by the host
 *     reconciler.
 *   - anything else — drop (set to `undefined`). The setting renders
 *     without a widget, which is the safe failure mode.
 *
 * Spreading each definition produces a host-allocated object whose
 * non-`widget` fields remain plugin-side proxies; the host only needs
 * the `widget` field itself to be host-controlled.
 */
function sanitizePluginSettings(
  settings: CustomVisualization<Record<string, unknown>>["settings"],
  pluginId: CustomVizPluginId,
): CustomVisualization<Record<string, unknown>>["settings"] {
  if (!settings) {
    return settings;
  }
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(
    settings as Record<string, unknown>,
  )) {
    if (!def || typeof def !== "object") {
      out[key] = def;
      continue;
    }
    const widget = (def as { widget?: unknown }).widget;
    if (typeof widget === "string" || widget == null) {
      out[key] = { ...(def as object) };
    } else if (typeof widget === "function") {
      out[key] = {
        ...(def as object),
        widget: stampPluginWidget(widget as WidgetMount, pluginId),
      };
    } else {
      out[key] = { ...(def as object), widget: undefined };
    }
  }
  return out as CustomVisualization<Record<string, unknown>>["settings"];
}
