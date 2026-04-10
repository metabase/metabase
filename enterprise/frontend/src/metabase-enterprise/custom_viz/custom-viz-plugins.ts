import type {
  CreateCustomVisualizationProps,
  CustomVisualizationSettingDefinition,
} from "custom-viz/src/types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useListCustomVizPluginsQuery } from "metabase/api";
import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { useToast } from "metabase/common/hooks";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import { useColorScheme } from "metabase/ui";
import visualizations, { registerVisualization } from "metabase/visualizations";
import {
  getCustomPluginIdentifier,
  getPluginAssetUrl,
} from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import type {
  Visualization,
  VisualizationIconComponent,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import type {
  CustomVizPluginId,
  CustomVizPluginRuntime,
} from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import { applyDefaultVisualizationProps } from "./custom-viz-common";
import { ensureVizApi } from "./custom-viz-globals";

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

// Themeable icon components loaded from each plugin's icon bundle.
// Populated by `loadCustomVizIcon` and consumed by Metabase UI surfaces
// (chart-type picker, CustomVizIcon, etc.) so icons participate in the
// white-labeling theme color cascade.
const loadedIcons = new Map<
  CustomVizPluginId,
  { commit: string | null; Component: VisualizationIconComponent }
>();

// Listeners notified whenever `loadedIcons` gains or replaces an entry so
// already-registered visualizations can be re-registered with the new
// IconComponent.
const iconListeners = new Set<(pluginId: CustomVizPluginId) => void>();

function notifyIconListeners(pluginId: CustomVizPluginId) {
  for (const listener of iconListeners) {
    listener(pluginId);
  }
}

/**
 * Look up the themeable icon component for a loaded plugin, if any.
 * Returns `undefined` before the icon bundle has finished loading (or when
 * the plugin does not provide one) — callers should gracefully fall back to
 * the URL-based icon.
 */
export function getCustomVizIconComponent(
  pluginId: CustomVizPluginId,
): VisualizationIconComponent | undefined {
  return loadedIcons.get(pluginId)?.Component;
}

/**
 * Subscribe to icon bundle load events. Returns an unsubscribe function.
 */
export function subscribeToCustomVizIcons(
  listener: (pluginId: CustomVizPluginId) => void,
): () => void {
  iconListeners.add(listener);
  return () => {
    iconListeners.delete(listener);
  };
}

/**
 * Hook that fetches the list of active custom visualization plugins.
 *
 * As a side effect, eagerly loads each plugin's themeable icon bundle (when
 * declared) so the chart-type picker and other UI surfaces can render the
 * icons with theme-color override (white-labeling). The main visualization
 * bundles stay lazy — only the tiny icon bundles are preloaded.
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
    if (!plugins) {
      return;
    }
    for (const plugin of plugins) {
      if (plugin.icon_bundle_url) {
        // Fire-and-forget; errors are logged inside loadCustomVizIcon.
        void loadCustomVizIcon(plugin);
      }
    }
  }, [plugins]);

  return plugins;
}

/**
 * Dev mode: listen for Server-Sent Events proxied through the Metabase backend.
 * The SSE proxy endpoint is at /api/ee/custom-viz-plugin/:id/dev-sse, which
 * forwards events from the dev server's /__sse endpoint. This avoids the need
 * for a CSP exception for the dev server origin.
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

    const sseUrl = `/api/ee/custom-viz-plugin/${plugin.id}/dev-sse`;

    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener("message", async () => {
      // eslint-disable-next-line no-console
      console.log(
        `[custom-viz] Dev server rebuilt "${plugin.display_name}", reloading…`,
      );
      setLoading(true);
      try {
        await Promise.all([
          loadCustomVizPlugin(plugin, `?t=${Date.now()}`, onInfo),
          plugin.icon_bundle_url
            ? loadCustomVizIcon(plugin, { force: true })
            : Promise.resolve(),
        ]);
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
      const identifier = getCustomPluginIdentifier(pluginToLoad);
      if (loadingRef.current === identifier) {
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
      loadingRef.current = identifier;
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
    load(plugin);
  }, [display, plugins, load]);

  useCustomVizDevReload(display, plugins, setLoading, onInfo);

  // `loading` state drives re-renders when async load completes.
  // Without it, the Map-based check alone wouldn't trigger a re-render.
  if (loading) {
    return { loading: true };
  }

  const needsCustomViz = isCustomVizDisplay(display);

  // Plugin list loaded but no matching plugin found — the custom viz was
  // removed or is otherwise unavailable.  Stop loading so the visualization
  // registry falls back to the default (Table).
  if (
    needsCustomViz &&
    plugins &&
    !plugins.find((p) => `custom:${p.identifier}` === display)
  ) {
    return { loading: false };
  }

  const matchedPlugin = needsCustomViz
    ? plugins?.find((p) => getCustomPluginIdentifier(p) === display)
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
        t`Plugin bundle must have a default export that is a factory function`,
      );
    }

    const cacheBust = cacheBustSuffix ? `&t=${Date.now()}` : "";

    const props: CreateCustomVisualizationProps<Record<string, unknown>> = {
      defineSetting(definition) {
        return definition as unknown as CustomVisualizationSettingDefinition<
          Record<string, unknown>
        >;
      },
      getAssetUrl(path: string) {
        return `${getPluginAssetUrl(plugin.id, path) ?? ""}${cacheBust}`;
      },
      locale:
        window.MetabaseUserLocalization?.headers?.language ??
        window.MetabaseSiteLocalization?.headers?.language ??
        "en",
    };

    const vizDef = factory(props);

    if (!vizDef || !vizDef.VisualizationComponent) {
      throw new Error(
        t`Factory must return an object with a VisualizationComponent property`,
      );
    }

    // Build a Metabase-compatible identifier, prefixed to avoid collisions
    const identifier = getCustomPluginIdentifier(plugin);

    const Wrapper = ({
      onVisualizationClick,
      onHoverChange,
      ...rest
    }: Omit<VisualizationProps, "width" | "height"> & {
      width: number | null;
      height: number | null;
    }) => {
      const { resolvedColorScheme } = useColorScheme();
      return React.createElement(vizDef.VisualizationComponent, {
        ...rest,
        colorScheme: resolvedColorScheme,
        onClick: onVisualizationClick,
        onHover: onHoverChange,
      });
    };

    // Attach the required static properties onto the component function
    const Component = ExplicitSize<VisualizationProps>({ wrapped: true })(
      Wrapper,
    ) as Visualization;
    applyDefaultVisualizationProps(Component, vizDef, {
      identifier,
      getUiName: () => plugin.display_name,
      iconUrl: getPluginAssetUrl(plugin.id, plugin.icon),
      iconDarkUrl: getPluginAssetUrl(plugin.id, plugin.icon_dark),
      IconComponent: getCustomVizIconComponent(plugin.id),
    });

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

    return identifier;
  } catch (error) {
    console.error(t`Failed to load plugin "${plugin.display_name}":`, error);
    return null;
  }
}

/**
 * Load a plugin's themeable icon bundle (`icon.js`) and register its exported
 * React component in `loadedIcons`. Mirrors `loadCustomVizPlugin`'s fetch +
 * script-tag + `window.MetabaseNonce` pattern so CSP is respected.
 *
 * This is independent from the main visualization bundle so that the chart
 * picker can render themeable icons without forcing every plugin's full
 * bundle to be executed up-front. Safe to call for every active plugin at
 * app startup.
 */
export async function loadCustomVizIcon(
  plugin: CustomVizPluginRuntime,
  { force = false }: { force?: boolean } = {},
): Promise<VisualizationIconComponent | null> {
  if (!plugin.icon_bundle_url) {
    return null;
  }

  const existing = loadedIcons.get(plugin.id);
  if (
    !force &&
    existing &&
    existing.commit === plugin.resolved_commit &&
    !plugin.dev_bundle_url
  ) {
    return existing.Component;
  }

  ensureVizApi();

  try {
    const iconUrl = new URL(plugin.icon_bundle_url, window.location.origin);
    if (force || plugin.dev_bundle_url) {
      iconUrl.searchParams.set("t", Date.now().toString());
    } else if (plugin.resolved_commit) {
      iconUrl.searchParams.set("v", plugin.resolved_commit);
    }

    const res = await fetch(iconUrl.href, { cache: "no-store" });
    if (!res.ok) {
      console.warn(
        `[custom-viz] Failed to load icon bundle for "${plugin.display_name}" (HTTP ${res.status})`,
      );
      return null;
    }

    const text = await res.text();
    const script = document.createElement("script");
    if (window.MetabaseNonce) {
      script.nonce = window.MetabaseNonce;
    }
    script.textContent = text;
    document.head.appendChild(script);
    document.head.removeChild(script);

    const Component = window.__customVizPluginIcon__;
    window.__customVizPluginIcon__ = undefined;

    if (typeof Component !== "function") {
      console.warn(
        `[custom-viz] Icon bundle for "${plugin.display_name}" did not assign window.__customVizPluginIcon__`,
      );
      return null;
    }

    const typed = Component as VisualizationIconComponent;
    loadedIcons.set(plugin.id, {
      commit: plugin.resolved_commit,
      Component: typed,
    });

    // If the visualization is already registered, mutate its IconComponent
    // in place so new renders of pickers pick it up.
    const registered = loadedPlugins.get(plugin.id);
    if (registered) {
      const viz = visualizations.get(
        registered.identifier as unknown as Parameters<
          typeof visualizations.get
        >[0],
      );
      if (viz) {
        (viz as Visualization).IconComponent = typed;
      }
    }

    notifyIconListeners(plugin.id);
    return typed;
  } catch (error) {
    console.warn(
      `[custom-viz] Failed to load icon bundle for "${plugin.display_name}":`,
      error,
    );
    return null;
  }
}

export { getCustomPluginIdentifier, getPluginAssetUrl };
