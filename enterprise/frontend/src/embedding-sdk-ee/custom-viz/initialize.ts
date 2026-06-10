import { useMemo } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import type { DispatchFn } from "metabase/redux/hooks";
import type { Dispatch } from "metabase/redux/store";
import { getPluginAssetUrl } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { customVizPluginApi } from "metabase-enterprise/api/custom-viz-plugin";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type {
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import { CustomVizSettingWidget } from "../../metabase-enterprise/custom_viz/components/CustomVizSettingWidget";
import type { LoadCustomVizPluginOptions } from "../../metabase-enterprise/custom_viz/custom-viz-plugins";
import {
  loadCustomVizPlugin as eeLoadCustomVizPlugin,
  useAutoLoadCustomVizPlugin as eeUseAutoLoadCustomVizPlugin,
  useCustomVizPlugins as eeUseCustomVizPlugins,
  useCustomVizPluginsIcon as eeUseCustomVizPluginsIcon,
  unregisterCustomVizDisplay,
} from "../../metabase-enterprise/custom_viz/custom-viz-plugins";
import { isWidgetMount } from "../../metabase-enterprise/custom_viz/widget-mount";

/**
 * The `enableCustomVisualizations` MetabaseProvider prop:
 * `false` = off, `true` = all installed plugins, `string[]` = allowlist of
 * plugin identifiers.
 */
type EnableSetting = boolean | string[];

function normalizeSetting(value: unknown): EnableSetting {
  return Array.isArray(value) ? value : Boolean(value);
}

function useEnableSetting(): EnableSetting {
  const { state } = useMetabaseProviderPropsStore();
  return normalizeSetting(state?.props?.enableCustomVisualizations);
}

function getEnableSetting(): EnableSetting {
  return normalizeSetting(
    ensureMetabaseProviderPropsStore().getState().props
      ?.enableCustomVisualizations,
  );
}

function isAllowed(setting: EnableSetting, identifier: string): boolean {
  if (setting === true) {
    return true;
  }
  if (Array.isArray(setting)) {
    return setting.includes(identifier);
  }
  return false;
}

function extractIdentifier(display: string | undefined): string | null {
  if (!display || !display.startsWith("custom:")) {
    return null;
  }
  return display.slice("custom:".length);
}

export function initializeSdkCustomVizPlugin() {
  if (!hasPremiumFeature("custom-viz")) {
    return;
  }

  Object.assign(PLUGIN_CUSTOM_VIZ, {
    // Force `about:blank` sandbox in the SDK so we never need the hosted
    // sandbox-host endpoint (which assumes a same-origin CSP relaxation that
    // SDK host pages won't have).
    loadCustomVizPlugin: (
      plugin: CustomVizPluginRuntime,
      options: LoadCustomVizPluginOptions = {},
    ) =>
      eeLoadCustomVizPlugin(plugin, {
        ...options,
        sandboxMode: "blank",
      }),

    loadCustomVizPluginForDisplay: async (
      dispatch: Dispatch,
      display: string,
    ): Promise<VisualizationDisplay | null> => {
      const identifier = extractIdentifier(display);
      if (!identifier || !isAllowed(getEnableSetting(), identifier)) {
        return null;
      }
      const action = (dispatch as DispatchFn)(
        customVizPluginApi.endpoints.listCustomVizPlugins.initiate(undefined),
      );
      try {
        const plugins = await action.unwrap();
        const plugin = plugins.find((p) => p.identifier === identifier);
        if (!plugin) {
          return null;
        }
        return (await eeLoadCustomVizPlugin(plugin, {
          sandboxMode: "blank",
        })) as VisualizationDisplay | null;
      } catch {
        // Plugin loading must never break the query flow.
        return null;
      } finally {
        action.unsubscribe();
      }
    },

    useAutoLoadCustomVizPlugin: (display: string | undefined) => {
      const setting = useEnableSetting();
      const identifier = extractIdentifier(display);
      const allowed = identifier ? isAllowed(setting, identifier) : true;

      // Drop a stale registration so questions with a no-longer-allowed
      // display fall back to the default visualization.
      if (display && !allowed) {
        unregisterCustomVizDisplay(display as VisualizationDisplay);
      }

      return eeUseAutoLoadCustomVizPlugin(allowed ? display : undefined, {
        sandboxMode: "blank",
      });
    },

    useCustomVizPlugins: (opts?: { enabled?: boolean }) => {
      const setting = useEnableSetting();
      const result = eeUseCustomVizPlugins(opts);
      // Key on the allowlist contents, not the array identity — the host may
      // pass a new (inline) array on every render.
      const settingKey = Array.isArray(setting) ? setting.join(",") : setting;
      // Memoized so consumers can use `plugins` as an effect dependency:
      // returning a fresh `.filter()` array on every render would re-trigger
      // those effects in a render loop.
      const plugins = useMemo(
        () => {
          if (setting === true || !result.plugins) {
            return result.plugins;
          }
          if (setting === false) {
            return [];
          }
          return result.plugins.filter((p) => setting.includes(p.identifier));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- settingKey stands in for `setting`
        [result.plugins, settingKey],
      );
      return { ...result, plugins };
    },

    useCustomVizPluginsIcon: () => {
      const setting = useEnableSetting();
      const getIcon = eeUseCustomVizPluginsIcon();
      return (display: VisualizationDisplay) => {
        const identifier = extractIdentifier(display);
        if (!identifier || !isAllowed(setting, identifier)) {
          return { icon: undefined, isLoading: false };
        }
        return getIcon(display);
      };
    },
    getPluginAssetUrl,
    isCustomVizDisplay,
    isWidgetMount,
    CustomVizSettingWidget,
    // Admin pages (ManageCustomVizPage, CustomVizPage, CustomVizDevPage) are
    // intentionally omitted — the SDK never renders them.
  });
}
