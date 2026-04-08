import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { getPluginAssetUrl } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import {
  CustomVizDevelopmentPage,
  CustomVizFormPage,
  ManageCustomVisualizationsPage,
} from "./components/CustomVizPluginsSettingsPage";
import {
  loadCustomVizPlugin,
  useAutoLoadCustomVizPlugin,
  useCustomVizPlugins,
} from "./custom-viz-plugins";
import {
  customVizRegistry,
  registerCustomVizPlugin,
} from "./custom-viz-static";

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
