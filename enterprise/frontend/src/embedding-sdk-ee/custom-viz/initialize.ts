import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import type { DispatchFn } from "metabase/redux/hooks";
import { getPluginAssetUrl } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { customVizPluginApi } from "metabase-enterprise/api/custom-viz-plugin";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { CustomVizPluginRuntime } from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import { CustomVizSettingWidget } from "../../metabase-enterprise/custom_viz/components/CustomVizSettingWidget";
import type { LoadCustomVizPluginOptions } from "../../metabase-enterprise/custom_viz/custom-viz-plugins";
import {
  loadCustomVizPlugin as eeLoadCustomVizPlugin,
  useAutoLoadCustomVizPlugin as eeUseAutoLoadCustomVizPlugin,
  useCustomVizPlugins as eeUseCustomVizPlugins,
  useCustomVizPluginsIcon as eeUseCustomVizPluginsIcon,
} from "../../metabase-enterprise/custom_viz/custom-viz-plugins";
import { isWidgetMount } from "../../metabase-enterprise/custom_viz/widget-mount";

export function initializeSdkCustomVizPlugin() {
  if (!hasPremiumFeature("custom-viz")) {
    return;
  }

  Object.assign(PLUGIN_CUSTOM_VIZ, {
    loadCustomVizPlugin: (
      plugin: CustomVizPluginRuntime,
      options: LoadCustomVizPluginOptions = {},
    ) =>
      eeLoadCustomVizPlugin(plugin, {
        ...options,
        // Note: in the future we might want to check the domain to check if we need "blank" or "sandbox" mode, to support data apps
        sandboxMode: "blank",
      }),

    loadCustomVizPluginForDisplay: async (
      dispatch: DispatchFn,
      display: string,
    ): Promise<string | null> => {
      if (!isCustomVizDisplay(display)) {
        return null;
      }
      const identifier = display.slice("custom:".length);
      const action = dispatch(
        customVizPluginApi.endpoints.listCustomVizPlugins.initiate(undefined),
      );
      try {
        const plugins = await action.unwrap();
        const plugin = plugins.find((p) => p.identifier === identifier);
        if (!plugin) {
          return null;
        }
        return await eeLoadCustomVizPlugin(plugin, {
          sandboxMode: "blank",
        });
      } catch {
        return null;
      } finally {
        action.unsubscribe();
      }
    },

    useAutoLoadCustomVizPlugin: (display: string | undefined) =>
      eeUseAutoLoadCustomVizPlugin(display, {
        sandboxMode: "blank",
      }),

    useCustomVizPlugins: eeUseCustomVizPlugins,

    useCustomVizPluginsIcon: eeUseCustomVizPluginsIcon,

    getPluginAssetUrl,
    isCustomVizDisplay,
    isWidgetMount,
    CustomVizSettingWidget,
    // Admin pages (ManageCustomVizPage, CustomVizPage, CustomVizDevPage) are
    // intentionally omitted — the SDK never renders them.
  });
}
