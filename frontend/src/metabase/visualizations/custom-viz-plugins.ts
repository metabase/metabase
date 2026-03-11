import { useEffect } from "react";

import { useListCustomVizPluginsQuery } from "metabase/api";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import type { CustomVizPluginRuntime } from "metabase-types/api";

// Track which plugins have already been loaded to avoid re-execution
const loadedPlugins = new Set<number>();

/**
 * Hook that fetches the list of active custom visualization plugins.
 * For PoC: logs available plugins to console.
 * This will later be used to register custom visualizations with the rendering pipeline.
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
      console.log("[custom-viz-plugins] Available plugins:", plugins);
    }
  }, [plugins]);

  return plugins;
}

/**
 * Dynamically load and execute a custom viz plugin's JS bundle.
 * Uses dynamic import() against the same-origin bundle endpoint,
 * which is allowed by the CSP `'self'` directive.
 */
export async function loadCustomVizPlugin(
  plugin: CustomVizPluginRuntime,
): Promise<void> {
  if (loadedPlugins.has(plugin.id)) {
    // eslint-disable-next-line no-console
    console.log(
      `[custom-viz-plugins] Plugin "${plugin.display_name}" already loaded, skipping`,
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[custom-viz-plugins] Loading plugin "${plugin.display_name}"…`);

  try {
    const absoluteUrl = new URL(plugin.bundle_url, window.location.origin).href;
    await import(/* webpackIgnore: true */ absoluteUrl);
    loadedPlugins.add(plugin.id);
    // eslint-disable-next-line no-console
    console.log(
      `[custom-viz-plugins] Plugin "${plugin.display_name}" loaded successfully`,
    );
  } catch (error) {
    console.error(
      `[custom-viz-plugins] Failed to load plugin "${plugin.display_name}":`,
      error,
    );
  }
}
