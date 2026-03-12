import React, { useEffect } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import { useListCustomVizPluginsQuery } from "metabase/api";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import type {
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";

import type { Visualization } from "./types/visualization";

import { registerVisualization } from ".";

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

// Track which plugins have already been loaded to avoid re-execution
const loadedPlugins = new Map<number, string>(); // id → registered identifier

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

  useEffect(() => {
    if (plugins && plugins.length > 0) {
      // eslint-disable-next-line no-console
      console.log("[custom-viz] Available plugins:", plugins);
    }
  }, [plugins]);

  return plugins;
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
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(
      `[custom-viz] Plugin "${plugin.display_name}" already registered as "${existing}"`,
    );
    return existing;
  }

  ensureVizApi();

  // eslint-disable-next-line no-console
  console.log(`[custom-viz] Loading plugin "${plugin.display_name}"…`);

  try {
    const absoluteUrl = new URL(plugin.bundle_url, window.location.origin).href;
    const imported = await import(/* webpackIgnore: true */ absoluteUrl);

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

    registerVisualization(Component);
    loadedPlugins.set(plugin.id, identifier);

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
