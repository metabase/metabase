import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import visualizations, { registerVisualization } from "metabase/visualizations";
import {
  defineSetting,
  getCustomPluginIdentifier,
  getPluginAssetUrl,
} from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import { CustomVizDevelopmentPage } from "./components/CustomVizDevelopmentPage";
import { CustomVizFormPage } from "./components/CustomVizFormPage";
import { ManageCustomVisualizationsPage } from "./components/ManageCustomVisualizationsPage";
import {
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
  const vizDef = factory({ defineSetting, getAssetUrl });
  const display = getCustomPluginIdentifier(identifier);
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
