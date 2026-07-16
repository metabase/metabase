// Deep import (not the metabase/plugins barrel): this module is loaded by the
// static-viz bundles, which must not drag the app UI stack in via the barrel.
import { PLUGIN_CUSTOM_VIZ_STATIC } from "metabase/plugins/oss/custom-viz-static";
import MetabaseSettings from "metabase/utils/settings";
import visualizations, { registerVisualization } from "metabase/visualizations";
// Deep import (not ./custom-viz-utils, whose metabase/urls import drags in
// metabase-lib + cljs) so the static-viz bundles stay slim.
import {
  defineSetting,
  getCustomPluginIdentifier,
} from "metabase/visualizations/custom-visualizations/custom-viz-core";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { applyDefaultVisualizationProps } from "./custom-viz-common";

// Registry for custom viz plugins in the GraalJS static-viz context.
export const customVizRegistry: Map<string, any> = new Map();

// Static SSR only renders a plugin's StaticVisualizationComponent and reads setting values via
// getComputedSettingsForSeries; it never mounts the interactive setting widgets whose WidgetMount
// carries the plugin-id marker. The numeric id also isn't available in this context (only the
// identifier string), so a sentinel is sufficient and never observed.
const STATIC_RENDER_PLUGIN_ID = -1;

export function registerCustomVizPlugin(factory: any, identifier: string) {
  const locale = MetabaseSettings.get("site-locale") ?? "en";
  const vizDef = factory({ defineSetting, locale });
  const display = getCustomPluginIdentifier(identifier);
  customVizRegistry.set(display, vizDef);

  // Register in main visualizations Map so getVisualizationRaw() resolves
  // the plugin's settings for getComputedSettingsForSeries()
  const Component = (vizDef.StaticVisualizationComponent ??
    (() => null)) as any;
  applyDefaultVisualizationProps(Component, vizDef, {
    identifier: display,
    pluginId: STATIC_RENDER_PLUGIN_ID,
    getUiName: () => identifier,
  });
  if (!visualizations.has(display)) {
    registerVisualization(Component);
  }
}

/**
 * Activate the EE custom-viz registry for static (GraalJS SSR) rendering. The
 * static-render counterpart of custom_viz/index's initializePlugin, kept separate
 * so the static-viz bundles don't pull in the interactive admin pages.
 */
export function initializeStaticVizPlugin() {
  if (hasPremiumFeature("custom-viz")) {
    Object.assign(PLUGIN_CUSTOM_VIZ_STATIC, {
      customVizRegistry,
      registerCustomVizPlugin,
    });
  }
}
