import { useCallback, useEffect, useMemo, useState } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { api } from "metabase/api/client";
import type { IconData } from "metabase/common/utils/icon";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import type { DispatchFn } from "metabase/redux/hooks";
import {
  getCustomPluginIdentifier,
  getPluginAssetUrl,
} from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { customVizPluginApi } from "metabase-enterprise/api/custom-viz-plugin";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type {
  CustomVizPluginId,
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
  unregisterCustomVizDisplay,
  useCustomVizPlugins,
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
  return isCustomVizDisplay(display) && allowlist.includes(display);
}

const warnedUnknownCustomViz = new Set<string>();
function warnUnknownCustomViz(display: string) {
  if (!warnedUnknownCustomViz.has(display)) {
    warnedUnknownCustomViz.add(display);
    console.warn(
      `Custom visualization "${display}" was requested but no matching ` +
        `installed plugin was found. Check the name and that the plugin is uploaded.`,
    );
  }
}

const pluginToIconBlob = new Map<CustomVizPluginId, string>();
const pluginToIconBlobPromise = new Map<
  CustomVizPluginId,
  Promise<string | undefined>
>();

// A cross-origin `<img>` can't carry the session header, so we fetch the icon
// with the auth in the headers and hand back a same-origin `blob:` url.
export const sdkCustomVizAssetManager = {
  resolveCustomVizAssetUrl: async (
    pluginId: CustomVizPluginId,
    assetPath: string | null | undefined,
  ): Promise<string | undefined> => {
    if (!assetPath) {
      return undefined;
    }
    let promise = pluginToIconBlobPromise.get(pluginId);
    if (!promise) {
      promise = (async () => {
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
          pluginToIconBlob.set(pluginId, objectUrl);
          return objectUrl;
        } catch {
          // Drop the failed promise so a later call can retry
          pluginToIconBlobPromise.delete(pluginId);
          return getPluginAssetUrl(pluginId, assetPath);
        }
      })();
      pluginToIconBlobPromise.set(pluginId, promise);
    }
    return promise;
  },
  releaseCustomVizAsset: (pluginId: CustomVizPluginId) => {
    const objectUrl = pluginToIconBlob.get(pluginId);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    pluginToIconBlob.delete(pluginId);
    pluginToIconBlobPromise.delete(pluginId);
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
      if (!getAllowlist().includes(getCustomPluginIdentifier(plugin))) {
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
          warnUnknownCustomViz(display);
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
          result.plugins?.filter((p) =>
            allowlist.includes(getCustomPluginIdentifier(p)),
          ) ?? [],
        // eslint-disable-next-line react-hooks/exhaustive-deps -- allowlistKey stands in for `allowlist`
        [result.plugins, allowlistKey],
      );

      // Warn the developers of the host app if they're passing a custom viz that we haven't found in the instance
      useEffect(() => {
        if (result.isLoading || !result.plugins) {
          return;
        }
        const installed: string[] = result.plugins.map((p) =>
          getCustomPluginIdentifier(p),
        );
        allowlist
          .filter((name) => !installed.includes(name))
          .forEach(warnUnknownCustomViz);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- allowlistKey stands in for `allowlist`
      }, [result.plugins, result.isLoading, allowlistKey]);

      return { ...result, plugins };
    },

    useCustomVizPluginsIcon: () => {
      const [blobs, setBlobs] = useState(new Map<CustomVizPluginId, string>());
      const allowlist = useAllowlist();

      const { plugins, isLoading } = useCustomVizPlugins();

      const allowlistKey = JSON.stringify(allowlist); // stable reference as the array can be a new one on every render

      useEffect(() => {
        let cancelled = false;
        const toResolve = (plugins ?? []).filter(
          (plugin) =>
            isCustomVizAllowed(getCustomPluginIdentifier(plugin), allowlist) &&
            plugin.icon,
        );
        Promise.all(
          toResolve.map(
            async (plugin) =>
              [
                plugin.id,
                await sdkCustomVizAssetManager.resolveCustomVizAssetUrl(
                  plugin.id,
                  plugin.icon,
                ),
              ] as const,
          ),
        ).then((entries) => {
          if (!cancelled) {
            setBlobs(
              new Map(
                entries.filter(
                  (entry): entry is [CustomVizPluginId, string] =>
                    entry[1] != null,
                ),
              ),
            );
          }
        });
        return () => {
          cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- allowlistKey stands in for `allowlist`
      }, [plugins, allowlistKey]);

      return useCallback(
        (
          display: VisualizationDisplay,
        ): { icon: IconData | undefined; isLoading: boolean } => {
          if (isLoading) {
            return { icon: undefined, isLoading: true };
          }
          const currentPlugin = plugins?.find(
            (plugin) => getCustomPluginIdentifier(plugin) === display,
          );

          // not an allowed custom-viz plugin: no icon
          if (!currentPlugin || !isCustomVizAllowed(display, allowlist)) {
            return { icon: undefined, isLoading: false };
          }

          // resolved blob is ready: use it
          const blobUrl = blobs.get(currentPlugin.id);
          if (blobUrl) {
            return {
              icon: { name: "unknown", iconUrl: blobUrl },
              isLoading: false,
            };
          }

          // otherwise still loading (the effect is resolving it), unless the
          // plugin has no icon to resolve at all
          return { icon: undefined, isLoading: Boolean(currentPlugin.icon) };
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- allowlistKey stands in for `allowlist`
        [plugins, isLoading, allowlistKey, blobs],
      );
    },
    getPluginAssetUrl,
    isCustomVizDisplay,
    isWidgetMount,
    CustomVizSettingWidget,
    // Admin pages (ManageCustomVizPage, CustomVizPage, CustomVizDevPage) are
    // intentionally omitted — the SDK never renders them.
  });
}
