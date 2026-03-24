import React, { useCallback, useEffect, useRef, useState } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { t } from "ttag";

import { useListCustomVizPluginsQuery } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type { IconName } from "metabase/ui";
import type {
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";

import type { Visualization } from "./types/visualization";

import visualizations, { registerVisualization } from ".";

type CustomVizPluginDefinition = {
  VisualizationComponent: Visualization;
  minSize?: Visualization["minSize"];
  defaultSize?: Visualization["defaultSize"];
  isSensible?: Visualization["isSensible"];
  checkRenderable?: Visualization["checkRenderable"];
  settings?: Visualization["settings"];
};

// ---------------------------------------------------------------------------
// Global API exposed to plugin bundles via window.__METABASE_VIZ_API__
// Plugins reference React from here instead of bundling their own copy.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __METABASE_VIZ_API__?: {
      React: typeof React;
      jsxRuntime: typeof jsxRuntime;
    };
    // Set by custom viz IIFE bundles during loading, read and cleared by loadCustomVizPlugin
    __customVizPlugin__?: (
      ...args: unknown[]
    ) => CustomVizPluginDefinition | null | undefined;
  }
}

function ensureVizApi() {
  if (!window.__METABASE_VIZ_API__) {
    window.__METABASE_VIZ_API__ = { React, jsxRuntime };
  }
}

/**
 * Build a URL for a plugin's static asset.
 */
export function getPluginAssetUrl(pluginId: number, assetPath: string): string {
  return `/api/custom-viz-plugin/${pluginId}/asset?path=${encodeURIComponent(assetPath)}`;
}

// ---------------------------------------------------------------------------
// Plugin loading & registration
// ---------------------------------------------------------------------------

// Track which plugins have already been loaded to avoid re-execution.
// Maps plugin id → { identifier, commit, etag } so we can detect when a
// refetch on the server produced a new commit or the dev bundle changed.
const loadedPlugins = new Map<
  number,
  { identifier: string; commit: string | null; etag: string | null }
>();

export function isCustomVizDisplay(display: string | undefined): boolean {
  return display != null && display.startsWith("custom:");
}

/**
 * Hook that fetches the list of active custom visualization plugins.
 */
export function useCustomVizPlugins({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const { data: plugins } = useListCustomVizPluginsQuery(undefined, {
    skip: !enabled,
  });

  return plugins;
}

/**
 * Dev mode: listen for Server-Sent Events from the Vite notify plugin.
 * The SSE server runs on the port after the dev_bundle_url port (e.g. 5175).
 * CSP must allow the SSE origin via MB_CUSTOM_VIZ_DEV_SERVER_URL env var.
 */
function useCustomVizDevReload(
  display: string | undefined,
  plugins: CustomVizPluginRuntime[] | undefined,
  setLoading: (loading: boolean) => void,
  onInfo: (message: string) => void,
) {
  useEffect(() => {
    if (!isCustomVizDisplay(display) || !plugins) {
      return;
    }

    const identifier = display!.slice("custom:".length);
    const plugin = plugins.find((p) => p.identifier === identifier);
    if (!plugin?.dev_bundle_url) {
      return;
    }

    const devUrl = new URL(plugin.dev_bundle_url);
    const notifyPort = Number(devUrl.port) + 1;
    const sseUrl = `http://${devUrl.hostname}:${notifyPort}`;

    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener("message", async () => {
      // eslint-disable-next-line no-console
      console.log(
        `[custom-viz] Dev server rebuilt "${plugin.display_name}", reloading…`,
      );
      setLoading(true);
      try {
        await loadCustomVizPlugin(plugin, `?t=${Date.now()}`, onInfo);
      } finally {
        setLoading(false);
      }
    });

    eventSource.addEventListener("error", () => {
      // SSE auto-reconnects; nothing to do
    });

    return () => {
      eventSource.close();
    };
  }, [display, onInfo, plugins, setLoading]);
}

/**
 * Hook that auto-loads a custom viz plugin bundle when the current display
 * type starts with "custom:". Returns `true` while loading so the caller
 * can show a spinner instead of rendering the (not-yet-registered) viz.
 *
 * For plugins with `dev_bundle_url` set, polls the bundle endpoint via HEAD
 * every 2s and reloads when the ETag changes.
 */
export function useAutoLoadCustomVizPlugin(display: string | undefined): {
  loading: boolean;
} {
  const plugins = useCustomVizPlugins();
  const [sendToast] = useToast();
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef<string | null>(null);

  const onInfo = useCallback(
    (message: string) => {
      sendToast({ message });
    },
    [sendToast],
  );

  const load = useCallback(
    async (pluginToLoad: CustomVizPluginRuntime) => {
      const ident = `custom:${pluginToLoad.identifier}`;
      if (loadingRef.current === ident) {
        return;
      }
      const existing = loadedPlugins.get(pluginToLoad.id);
      if (
        existing &&
        existing.commit === pluginToLoad.resolved_commit &&
        !pluginToLoad.dev_bundle_url
      ) {
        return;
      }
      loadingRef.current = ident;
      setLoading(true);
      try {
        await loadCustomVizPlugin(pluginToLoad, undefined, onInfo);
      } finally {
        loadingRef.current = null;
        setLoading(false);
      }
    },
    [onInfo],
  );

  useEffect(() => {
    if (!isCustomVizDisplay(display) || !plugins) {
      return;
    }

    const identifier = display!.slice("custom:".length);
    const plugin = plugins.find((p) => p.identifier === identifier);
    if (!plugin) {
      return;
    }
    const existing = loadedPlugins.get(plugin.id);
    if (!existing || existing.commit !== plugin.resolved_commit) {
      load(plugin);
    }
  }, [display, plugins, load]);

  useCustomVizDevReload(display, plugins, setLoading, onInfo);

  // `loading` state drives re-renders when async load completes.
  // Without it, the Map-based check alone wouldn't trigger a re-render.
  if (loading) {
    return { loading: true };
  }

  const needsCustomViz = isCustomVizDisplay(display);
  const matchedPlugin = needsCustomViz
    ? plugins?.find((p) => `custom:${p.identifier}` === display)
    : undefined;
  const isReady =
    matchedPlugin != null &&
    loadedPlugins.get(matchedPlugin.id)?.commit ===
      matchedPlugin.resolved_commit;

  return { loading: needsCustomViz && !isReady };
}

/**
 * Dynamically load a custom viz plugin bundle, call its factory,
 * decompose the returned definition, and register it as a Metabase
 * visualization. Returns the registered identifier (CardDisplayType).
 */
export async function loadCustomVizPlugin(
  plugin: CustomVizPluginRuntime,
  cacheBustSuffix?: string,
  onInfo?: (message: string) => void,
): Promise<string | null> {
  const existing = loadedPlugins.get(plugin.id);
  if (
    existing &&
    existing.commit === plugin.resolved_commit &&
    !plugin.dev_bundle_url &&
    !cacheBustSuffix
  ) {
    return existing.identifier;
  }

  ensureVizApi();

  // eslint-disable-next-line no-console
  console.log(`[custom-viz] Loading plugin "${plugin.display_name}"…`);

  try {
    const bundleUrl = new URL(plugin.bundle_url, window.location.origin);
    if (cacheBustSuffix) {
      bundleUrl.searchParams.set("t", Date.now().toString());
    } else if (plugin.resolved_commit) {
      bundleUrl.searchParams.set("v", plugin.resolved_commit);
    }
    const res = await fetch(bundleUrl.href, { cache: "no-store" });
    if (!res.ok) {
      onInfo?.(
        t`Couldn't load "${plugin.display_name}" plugin bundle (HTTP ${res.status}).`,
      );
      return null;
    }

    const text = await res.text();

    // Execute in global scope so `var __customVizPlugin__` assigns to window
    const script = document.createElement("script");
    if (window.MetabaseNonce) {
      script.nonce = window.MetabaseNonce;
    }
    script.textContent = text;
    document.head.appendChild(script);
    document.head.removeChild(script);
    const factory = window.__customVizPlugin__;
    window.__customVizPlugin__ = undefined;

    if (typeof factory !== "function") {
      throw new Error(
        "Plugin bundle must have a default export that is a factory function",
      );
    }

    const getAssetUrl = (path: string) => getPluginAssetUrl(plugin.id, path);
    const vizDef = factory({ getAssetUrl });
    if (!vizDef || !vizDef.VisualizationComponent) {
      throw new Error(
        "Factory must return an object with a VisualizationComponent property",
      );
    }

    // Build a Metabase-compatible identifier, prefixed to avoid collisions
    const identifier = `custom:${plugin.identifier}` as VisualizationDisplay;

    // Attach the required static properties onto the component function
    const Component = vizDef.VisualizationComponent as Visualization;
    Object.assign(Component, {
      identifier,
      getUiName: () => plugin.display_name,
      iconUrl: getPluginAssetUrl(plugin.id, plugin.icon),
      minSize: vizDef.minSize,
      defaultSize: vizDef.defaultSize,
      isSensible: vizDef.isSensible,
      checkRenderable: vizDef.checkRenderable,
      settings: vizDef.settings,
      hidden: false,
      noHeader: false,
      canSavePng: false,
    } satisfies Partial<Record<keyof Visualization, unknown>>);

    // Use registerVisualization for first load; overwrite directly for updates
    // (registerVisualization throws on duplicate identifiers).
    // Check visualizations map directly (not loadedPlugins) because HMR may
    // reset loadedPlugins while the visualizations map retains registrations.
    if (visualizations.has(identifier)) {
      visualizations.set(identifier, Component);
    } else {
      registerVisualization(Component);
    }
    loadedPlugins.set(plugin.id, {
      identifier,
      commit: plugin.resolved_commit,
      etag: null,
    });

    // eslint-disable-next-line no-console
    console.log(
      `[custom-viz] Registered "${plugin.display_name}" as "${identifier}"`,
    );

    return identifier;
  } catch (error) {
    console.error(
      `[custom-viz] Failed to load plugin "${plugin.display_name}":`,
      error,
    );
    return null;
  }
}
