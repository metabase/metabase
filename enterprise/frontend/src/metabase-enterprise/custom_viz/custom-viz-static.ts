import MetabaseSettings from "metabase/utils/settings";
import visualizations, { registerVisualization } from "metabase/visualizations";
import {
  defineSetting,
  getCustomPluginIdentifier,
} from "metabase/visualizations/custom-visualizations/custom-viz-utils";

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
