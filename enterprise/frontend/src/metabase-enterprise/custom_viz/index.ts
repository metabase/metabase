import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import {
  getPluginAssetUrl,
  resolveCustomVizAssetUrl,
} from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import { CustomVizDevPage } from "./components/CustomVizDevPage";
import { CustomVizPage } from "./components/CustomVizPage";
import { CustomVizSettingWidget } from "./components/CustomVizSettingWidget";
import { ManageCustomVizPage } from "./components/ManageCustomVizPage";
import {
  loadCustomVizPlugin,
  useAutoLoadCustomVizPlugin,
  useCustomVizPlugins,
  useCustomVizPluginsIcon,
} from "./custom-viz-plugins";
import { isWidgetMount } from "./widget-mount";

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
      resolveCustomVizAssetUrl,
      releaseCustomVizAsset: () => {},
      useCustomVizPluginsIcon,
      isCustomVizDisplay,
      isWidgetMount,
      CustomVizSettingWidget,
    });
  }
}
