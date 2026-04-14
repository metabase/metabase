import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { getPluginAssetUrl } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import { CustomVizDevPage } from "./components/CustomVizDevPage";
import { CustomVizPage } from "./components/CustomVizPage";
import { ManageCustomVizPage } from "./components/ManageCustomVizPage";
import {
  loadCustomVizPlugin,
  useAutoLoadCustomVizPlugin,
  useCustomVizPlugins,
  useCustomVizPluginsIcon,
} from "./custom-viz-plugins";
import {
  customVizRegistry,
  registerCustomVizPlugin,
} from "./custom-viz-static";

export function initializePlugin() {
  if (hasPremiumFeature("custom-viz")) {
    Object.assign(PLUGIN_CUSTOM_VIZ, {
      ManageCustomVizPage,
      CustomVizPage,
      CustomVizDevPage,
      useAutoLoadCustomVizPlugin,
      useCustomVizPlugins,
      loadCustomVizPlugin,
      getPluginAssetUrl,
      useCustomVizPluginsIcon,
      isCustomVizDisplay,
      customVizRegistry,
      registerCustomVizPlugin,
    });
  }
}
