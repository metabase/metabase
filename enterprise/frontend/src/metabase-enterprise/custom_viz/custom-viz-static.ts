import MetabaseSettings from "metabase/utils/settings";
import visualizations, { registerVisualization } from "metabase/visualizations";
import {
  defineSetting,
  getCustomPluginIdentifier,
} from "metabase/visualizations/custom-visualizations/custom-viz-utils";

import { applyDefaultVisualizationProps } from "./custom-viz-common";

// Registry for custom viz plugins in the GraalJS static-viz context.
export const customVizRegistry: Map<string, any> = new Map();

export function registerCustomVizPlugin(
  factory: any,
  identifier: string,
  assets: any,
) {
  const assetMap = assets || {};
  const getAssetUrl = (name: string) => assetMap[name] || "";
  const locale = MetabaseSettings.get("site-locale") ?? "en";
  const vizDef = factory({ defineSetting, getAssetUrl, locale });
  const display = getCustomPluginIdentifier(identifier);
  customVizRegistry.set(display, vizDef);

  // Register in main visualizations Map so getVisualizationRaw() resolves
  // the plugin's settings for getComputedSettingsForSeries()
  const Component = (vizDef.StaticVisualizationComponent ??
    (() => null)) as any;
  applyDefaultVisualizationProps(Component, vizDef, {
    identifier: display,
    getUiName: () => identifier,
  });
  if (!visualizations.has(display)) {
    registerVisualization(Component);
  }
}
