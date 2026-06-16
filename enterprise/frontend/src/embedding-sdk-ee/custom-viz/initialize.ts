import { useEffect, useMemo } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { api } from "metabase/api/client";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import type { DispatchFn } from "metabase/redux/hooks";
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
 * Allowlist of plugin identifiers from the `allowedCustomVisualizations`
 * MetabaseProvider prop. Empty / undefined = no custom viz allowed.
 */
function useAllowlist(): string[] {
  const { state } = useMetabaseProviderPropsStore();
  return state?.props?.allowedCustomVisualizations ?? [];
}

function getAllowlist(): string[] {
  return (
    ensureMetabaseProviderPropsStore().getState().props
      ?.allowedCustomVisualizations ?? []
  );
}

/**
 * Whether `display` is an allowed `custom:*` visualization. False for
 * non-custom displays and for custom ones missing from the allowlist.
 */
function isCustomVizAllowed(
  display: string | undefined,
  allowlist: string[],
): boolean {
  return (
    isCustomVizDisplay(display) &&
    allowlist.includes(display.slice("custom:".length))
  );
}

const assetObjectUrls = new Map<number, string>();

// A cross-origin `<img>` can't carry the session header, so we fetch the icon
// with the auth in the headers and hand back a same-origin `blob:` url.
export const sdkCustomVizAssetManager = {
  resolveCustomVizAssetUrl: async (
    pluginId: number,
    assetPath: string | null | undefined,
  ): Promise<string | undefined> => {
    if (!assetPath) {
      return undefined;
    }
    try {
      const res = await api.fetch({
        method: "GET",
        url: `/api/ee/custom-viz-plugin/${pluginId}/asset`,
        params: { path: assetPath },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const objectUrl = URL.createObjectURL(await res.blob());
      const previous = assetObjectUrls.get(pluginId);
      assetObjectUrls.set(pluginId, objectUrl);
      // if there was a previous asset, revoke it
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return objectUrl;
    } catch {
      return getPluginAssetUrl(pluginId, assetPath);
    }
  },
  releaseCustomVizAsset: (pluginId: number) => {
    const objectUrl = assetObjectUrls.get(pluginId);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      assetObjectUrls.delete(pluginId);
    }
  },
};

export function initializeSdkCustomVizPlugin() {
  if (!hasPremiumFeature("custom-viz")) {
    return;
  }

  Object.assign(PLUGIN_CUSTOM_VIZ, {
    ...sdkCustomVizAssetManager,

    loadCustomVizPlugin: (
      plugin: CustomVizPluginRuntime,
      options: LoadCustomVizPluginOptions = {},
    ) => {
      // We should only be calling this for allowed plugins, but this checks again to be safer
      if (!getAllowlist().includes(plugin.identifier)) {
        return Promise.resolve(null);
      }
      return eeLoadCustomVizPlugin(plugin, {
        ...options,
        // Note: in the future we might want to check the domain to check if we need "blank" or "sandbox" mode, to support data apps
        sandboxMode: "blank",
      });
    },

    loadCustomVizPluginForDisplay: async (
      dispatch: DispatchFn,
      display: string,
    ): Promise<string | null> => {
      if (!isCustomVizAllowed(display, getAllowlist())) {
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

    useAutoLoadCustomVizPlugin: (display: string | undefined) => {
      const allowlist = useAllowlist();
      const allowed =
        // Regular (non-custom) displays are always allowed.
        !isCustomVizDisplay(display) || isCustomVizAllowed(display, allowlist);

      useEffect(() => {
        if (isCustomVizDisplay(display) && !allowed) {
          unregisterCustomVizDisplay(display);
        }
      }, [display, allowed]);

      return eeUseAutoLoadCustomVizPlugin(allowed ? display : undefined, {
        sandboxMode: "blank",
      });
    },

    useCustomVizPlugins: (opts?: { enabled?: boolean }) => {
      const allowlist = useAllowlist();
      const result = eeUseCustomVizPlugins(opts);
      // Key on the allowlist contents, not the array identity: the host may
      // pass a new (inline) array on every render.
      const allowlistKey = JSON.stringify(allowlist);
      // Memoized so consumers can use `plugins` as an effect dependency:
      // returning a fresh `.filter()` array on every render would re-trigger
      // those effects in a render loop.
      const plugins = useMemo(
        () =>
          result.plugins?.filter((p) => allowlist.includes(p.identifier)) ?? [],
        // eslint-disable-next-line react-hooks/exhaustive-deps -- allowlistKey stands in for `allowlist`
        [result.plugins, allowlistKey],
      );
      return { ...result, plugins };
    },

    useCustomVizPluginsIcon: () => {
      const allowlist = useAllowlist();
      const getIcon = eeUseCustomVizPluginsIcon();
      return (display: VisualizationDisplay) => {
        if (!isCustomVizAllowed(display, allowlist)) {
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
