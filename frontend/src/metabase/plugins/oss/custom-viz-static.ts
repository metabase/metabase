import type { ComponentType } from "react";

// The static-render (GraalJS SSR) surface of the custom-viz plugin, split from
// PLUGIN_CUSTOM_VIZ (./custom-viz) so the static-viz bundles can use the registry
// without importing this barrel's UI dependencies (PluginPlaceholder -> metabase/ui).
// Keep this module (and its imports) free of React components and app UI.

const getDefaultPluginCustomVizStatic = () => ({
  customVizRegistry: new Map<string, Record<string, ComponentType<any>>>(),
  registerCustomVizPlugin: (
    _factory: (
      props: Record<string, unknown>,
    ) => Record<string, ComponentType<any>>,
    _identifier: string,
  ) => {},
});

export const PLUGIN_CUSTOM_VIZ_STATIC = getDefaultPluginCustomVizStatic();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_CUSTOM_VIZ_STATIC, getDefaultPluginCustomVizStatic());
}
