import type {
  CreateCustomVisualizationProps,
  CustomVisualization,
  CustomVisualizationMountHandle,
  CustomVisualizationProps,
  CustomVisualizationSettingDefinition,
  ClickObject as CustomVizClickObject,
  HoverObject as CustomVizHoverObject,
  Widgets,
} from "custom-viz";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { useToast } from "metabase/common/hooks";
import type { IconData } from "metabase/common/utils/icon";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import { useColorScheme } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";
import visualizations, { registerVisualization } from "metabase/visualizations";
import {
  getCustomPluginIdentifier,
  getPluginAssetUrl,
} from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import type {
  Visualization,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import { useListCustomVizPluginsQuery } from "metabase-enterprise/api";
import type {
  CustomVizPluginId,
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import { trackCustomVizSelected } from "./analytics";
import { applyDefaultVisualizationProps } from "./custom-viz-common";
import { ensureVizApi } from "./custom-viz-globals";

// Track which plugins have already been loaded to avoid re-execution.
// Maps plugin id → { identifier, hash } so we can detect when a re-uploaded
// bundle (or a dev server reload) produced new bytes.
const loadedPlugins = new Map<
  number,
  { identifier: string; hash: string | null }
>();

const failedPluginHashes = new Map<
  CustomVizPluginId,
  CustomVizPluginRuntime["bundle_hash"]
>();

/**
 * Hook that fetches the list of active custom visualization plugins.
 */
export function useCustomVizPlugins({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const { token, uuid } = useEmbeddingEntityContext();
  const isPublicOrStaticEmbed = Boolean(token || uuid);
  const shouldLoad = enabled && !isPublicOrStaticEmbed;
  const { data: plugins, isLoading } = useListCustomVizPluginsQuery(undefined, {
    skip: !shouldLoad,
  });

  return { plugins, isLoading, disabled: isPublicOrStaticEmbed };
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

    const identifier = display.slice("custom:".length);
    const plugin = plugins.find((p) => p.identifier === identifier);
    if (!plugin?.dev_bundle_url) {
      return;
    }

    const sseUrl = getSubpathSafeUrl(
      `/api/ee/custom-viz-plugin/${plugin.id}/dev-sse`,
    );

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
  const { plugins, disabled } = useCustomVizPlugins();
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
        existing.hash === (pluginToLoad.bundle_hash ?? null) &&
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

    const identifier = display.slice("custom:".length);
    const plugin = plugins.find((p) => p.identifier === identifier);
    if (!plugin) {
      return;
    }
    trackCustomVizSelected();
    load(plugin);
  }, [display, plugins, load]);

  useCustomVizDevReload(display, plugins, setLoading, onInfo);

  // `loading` state drives re-renders when async load completes.
  // Without it, the Map-based check alone wouldn't trigger a re-render.
  if (loading) {
    return { loading: true };
  }

  const needsCustomViz = isCustomVizDisplay(display);

  /**
   * Short-circuit if custom-viz plugins are disabled (e.g., public or embedded questions/dashboards).
   */
  if (disabled) {
    return { loading: false };
  }

  // Plugin list loaded but no matching plugin found — the custom viz was
  // disabled or removed. Drop the cached registration so questions using this
  // display fall back to the default visualization on subsequent
  // renders, even within the same SPA session.
  if (
    needsCustomViz &&
    plugins &&
    !plugins.find((p) => `custom:${p.identifier}` === display)
  ) {
    if (visualizations.has(display)) {
      visualizations.delete(display);
      for (const [id, entry] of loadedPlugins) {
        if (entry.identifier === display) {
          loadedPlugins.delete(id);
          failedPluginHashes.delete(id);
        }
      }
    }
    return { loading: false };
  }

  const matchedPlugin = needsCustomViz
    ? plugins?.find((p) => getCustomPluginIdentifier(p) === display)
    : undefined;

  // A plugin is "ready" when we've either loaded its bundle or recorded a
  // failure for the current bundle hash. Failed plugins resolve to
  // loading: false so the visualization registry falls back to the default
  // instead of spinning forever.
  const isReady = (() => {
    if (!matchedPlugin) {
      return false;
    }
    const loadedHash = loadedPlugins.get(matchedPlugin.id)?.hash;
    const failedHash = failedPluginHashes.get(matchedPlugin.id);
    if (loadedHash === undefined && failedHash === undefined) {
      return false;
    }
    const currentHash = matchedPlugin.bundle_hash ?? null;
    return currentHash === loadedHash || currentHash === failedHash;
  })();

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
  const currentHash = plugin.bundle_hash ?? null;
  if (
    existing &&
    existing.hash === currentHash &&
    !plugin.dev_bundle_url &&
    !cacheBustSuffix
  ) {
    return existing.identifier;
  }

  ensureVizApi();

  try {
    const bundleUrl = new URL(
      getSubpathSafeUrl(plugin.bundle_url),
      window.location.origin,
    );
    if (cacheBustSuffix) {
      bundleUrl.searchParams.set("t", Date.now().toString());
    } else if (currentHash) {
      bundleUrl.searchParams.set("v", currentHash);
    }
    const res = await fetch(bundleUrl.href, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();

    // Lazy-load the sandbox so its top-level references to browser globals
    // (Document/Window/Navigator/etc. in sandbox/distortions-*.ts) don't end
    // up in the static-viz bundle, which is evaluated by GraalVM and has no
    // DOM constructors.
    const { createPluginSandbox } = await import("./sandbox");
    const sandbox = createPluginSandbox(plugin.id);
    const factory = sandbox.evaluate(text);

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

    if (!isValidVizDefinition(vizDef)) {
      throw new Error(
        t`Plugin factory must return an object with a mount function`,
      );
    }

    assertValidSettingWidgets(vizDef.settings);

    // Build a Metabase-compatible identifier, prefixed to avoid collisions
    const identifier = getCustomPluginIdentifier(plugin);

    const Wrapper = createCustomVizWrapper(vizDef.mount, plugin.id);

    // Attach the required static properties onto the component function
    const Component = ExplicitSize<VisualizationProps>({ wrapped: true })(
      Wrapper,
    ) as Visualization;
    applyDefaultVisualizationProps(Component, vizDef, {
      identifier,
      getUiName: () => plugin.display_name,
      iconUrl: getPluginAssetUrl(plugin.id, plugin.icon),
      isDev: Boolean(plugin.dev_bundle_url),
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
      hash: currentHash,
    });
    failedPluginHashes.delete(plugin.id);

    return identifier;
  } catch (error) {
    console.error(t`Failed to load plugin "${plugin.display_name}":`, error);
    if (!failedPluginHashes.has(plugin.id)) {
      onInfo?.(
        t`The "${plugin.display_name}" visualization is currently unavailable.`,
      );
    }
    failedPluginHashes.set(plugin.id, currentHash);
    return null;
  }
}

export const useCustomVizPluginsIcon = () => {
  const { plugins, isLoading } = useCustomVizPlugins();

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
      const icon: IconData | undefined = currentPlugin
        ? {
            name: "unknown",
            iconUrl: getPluginAssetUrl(currentPlugin.id, currentPlugin.icon),
          }
        : undefined;

      return { icon, isLoading: false };
    },
    [plugins, isLoading],
  );
};

type GenericVizDefinition = CustomVisualization<Record<string, unknown>>;
type GenericVizMount = GenericVizDefinition["mount"];
type GenericVizPluginProps = CustomVisualizationProps<Record<string, unknown>>;
type GenericVizMountHandle =
  CustomVisualizationMountHandle<GenericVizPluginProps>;

function isValidVizDefinition(value: unknown): value is GenericVizDefinition {
  return isObject(value) && typeof value.mount === "function";
}

const ALLOWED_WIDGET_NAMES: Array<keyof Widgets> = [
  "input",
  "number",
  "radio",
  "select",
  "toggle",
  "segmentedControl",
  "field",
  "fields",
  "color",
  "multiselect",
] as const;

function assertValidSettingWidgets(
  settings: GenericVizDefinition["settings"] | undefined,
): void {
  if (!settings) {
    return;
  }
  for (const [settingId, def] of Object.entries(settings)) {
    const widget = (def as { widget?: unknown }).widget;
    if (
      typeof widget !== "string" ||
      !ALLOWED_WIDGET_NAMES.some((w) => w === widget)
    ) {
      throw new Error(
        t`Setting "${settingId}" has unsupported widget. Use one of: ${ALLOWED_WIDGET_NAMES.join(", ")}.`,
      );
    }
  }
}

function createCustomVizWrapper(
  mount: GenericVizMount,
  pluginId: CustomVizPluginId,
) {
  return function CustomVizWrapper({
    width,
    height,
    series,
    settings,
    onVisualizationClick,
    onHoverChange,
  }: VisualizationProps) {
    const { resolvedColorScheme } = useColorScheme();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const handleRef = useRef<GenericVizMountHandle | null>(null);

    const pluginProps: GenericVizPluginProps = {
      width,
      height,
      series: series as unknown as GenericVizPluginProps["series"],
      settings: settings as unknown as GenericVizPluginProps["settings"],
      colorScheme: resolvedColorScheme,
      onClick: onVisualizationClick as unknown as (
        clickObject: CustomVizClickObject<Record<string, unknown>> | null,
      ) => void,
      onHover: onHoverChange as unknown as (
        hoverObject?: CustomVizHoverObject | null,
      ) => void,
    };

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }
      if (!handleRef.current) {
        handleRef.current = mount(containerRef.current, pluginProps);
      } else {
        handleRef.current.update(pluginProps);
      }
    });

    useUnmount(() => {
      handleRef.current?.unmount();
      handleRef.current = null;
    });

    return (
      <div
        ref={containerRef}
        data-plugin-sandbox={pluginId}
        style={{ width: "100%", height: "100%" }}
      />
    );
  };
}

export { getCustomPluginIdentifier, getPluginAssetUrl };
