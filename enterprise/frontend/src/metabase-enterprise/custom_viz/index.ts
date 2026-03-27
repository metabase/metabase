import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import visualizations, {
  registerVisualization,
} from "metabase/visualizations";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { VisualizationDisplay } from "metabase-types/api";

import { CustomVizChartTypeSection } from "./components/CustomVizChartTypeSection";
import {
  CustomVizDevelopmentPage,
  CustomVizFormPage,
  ManageCustomVisualizationsPage,
} from "./components/CustomVizPluginsSettingsPage";
import {
  getPluginAssetUrl,
  isCustomVizDisplay,
  loadCustomVizPlugin,
  useAutoLoadCustomVizPlugin,
  useCustomVizPlugins,
} from "./custom-viz-plugins";

// Registry for custom viz plugins in the GraalJS static-viz context.
const customVizRegistry: Map<string, any> = new Map();

function registerCustomVizPlugin(
  factory: any,
  identifier: string,
  assets: any,
) {
  const assetMap = assets || {};
  const getAssetUrl = (name: string) => assetMap[name] || "";
  const vizDef = factory({ getAssetUrl });
  const display = `custom:${identifier}` as VisualizationDisplay;
  customVizRegistry.set(display, vizDef);

  // Register in main visualizations Map so getVisualizationRaw() resolves
  // the plugin's settings for getComputedSettingsForSeries()
  const Component = vizDef.StaticVisualizationComponent ?? (() => null);
  Object.assign(Component, {
    identifier: display,
    getUiName: () => identifier,
    iconName: "area",
    settings: vizDef.settings ?? {},
    isSensible: vizDef.isSensible,
    checkRenderable: vizDef.checkRenderable,
    hidden: true,
    noHeader: false,
    canSavePng: false,
  });
  if (!visualizations.has(display)) {
    registerVisualization(Component);
  }
}

export function initializePlugin() {
  if (hasPremiumFeature("custom-viz")) {
    Object.assign(PLUGIN_CUSTOM_VIZ, {
      ManageCustomVisualizationsPage,
      CustomVizFormPage,
      CustomVizDevelopmentPage,
      CustomVizChartTypeSection,
      useAutoLoadCustomVizPlugin,
      useCustomVizPlugins,
      loadCustomVizPlugin,
      getPluginAssetUrl,
      isCustomVizDisplay,
      customVizRegistry,
      registerCustomVizPlugin,
    });
  }
}
