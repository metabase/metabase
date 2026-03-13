import React, { useCallback, useEffect, useRef, useState } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import { useListCustomVizPluginsQuery } from "metabase/api";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import type { IconName } from "metabase/ui";
import type {
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";

import type { Visualization } from "./types/visualization";

import visualizations, { registerVisualization } from ".";

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
  }
}

function ensureVizApi() {
  if (!window.__METABASE_VIZ_API__) {
    window.__METABASE_VIZ_API__ = { React, jsxRuntime };
  }
}

// ---------------------------------------------------------------------------
// Plugin loading & registration
// ---------------------------------------------------------------------------

// Track which plugins have already been loaded to avoid re-execution.
// Maps plugin id → { identifier, commit } so we can detect when a
// refetch on the server produced a new commit.
const loadedPlugins = new Map<
  number,
  { identifier: string; commit: string | null }
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
  const { token, uuid } = useEmbeddingEntityContext();
  const isPublicOrStaticEmbed = Boolean(token || uuid);
  const shouldLoad = enabled && !isPublicOrStaticEmbed;
  const { data: plugins } = useListCustomVizPluginsQuery(undefined, {
    skip: !shouldLoad,
  });

  return plugins;
}

/**
 * Hook that auto-loads a custom viz plugin bundle when the current display
 * type starts with "custom:". Returns `true` while loading so the caller
 * can show a spinner instead of rendering the (not-yet-registered) viz.
 */
export function useAutoLoadCustomVizPlugin(display: string | undefined): {
  loading: boolean;
} {
  const plugins = useCustomVizPlugins();
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef<string | null>(null);

  const load = useCallback(async (pluginToLoad: CustomVizPluginRuntime) => {
    const ident = `custom:${pluginToLoad.identifier}`;
    if (loadingRef.current === ident) {
      return;
    }
    const existing = loadedPlugins.get(pluginToLoad.id);
    if (existing && existing.commit === pluginToLoad.resolved_commit) {
      return;
    }
    loadingRef.current = ident;
    setLoading(true);
    try {
      await loadCustomVizPlugin(pluginToLoad);
    } finally {
      loadingRef.current = null;
      setLoading(false);
    }
  }, []);

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
): Promise<string | null> {
  const existing = loadedPlugins.get(plugin.id);
  if (existing && existing.commit === plugin.resolved_commit) {
    // eslint-disable-next-line no-console
    console.log(
      `[custom-viz] Plugin "${plugin.display_name}" already registered as "${existing.identifier}"`,
    );
    return existing.identifier;
  }

  ensureVizApi();

  // eslint-disable-next-line no-console
  console.log(`[custom-viz] Loading plugin "${plugin.display_name}"…`);

  try {
    const bundleUrl = new URL(plugin.bundle_url, window.location.origin);
    if (plugin.resolved_commit) {
      bundleUrl.searchParams.set("v", plugin.resolved_commit);
    }
    const imported = await import(/* webpackIgnore: true */ bundleUrl.href);

    const factory = imported.default;
    if (typeof factory !== "function") {
      throw new Error(
        "Plugin bundle must have a default export that is a factory function",
      );
    }

    const vizDef = factory({});
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
      iconName: (plugin.icon ?? "area") as IconName,
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
    if (loadedPlugins.has(plugin.id)) {
      visualizations.set(identifier, Component);
    } else {
      registerVisualization(Component);
    }
    loadedPlugins.set(plugin.id, {
      identifier,
      commit: plugin.resolved_commit,
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
