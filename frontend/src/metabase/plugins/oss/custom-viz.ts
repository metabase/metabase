import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type {
  CustomVizPluginId,
  CustomVizPluginRuntime,
} from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards";

const getDefaultPluginCustomViz = () => ({
  // Admin settings pages
  ManageCustomVizPage: PluginPlaceholder as ComponentType<any>,
  CustomVizPage: PluginPlaceholder as ComponentType<any>,
  CustomVizDevPage: PluginPlaceholder as ComponentType<any>,

  // Hooks & functions
  useAutoLoadCustomVizPlugin: (_display: string | undefined) => ({
    loading: false,
  }),
  useCustomVizPlugins: (_opts?: { enabled?: boolean }) =>
    undefined as CustomVizPluginRuntime[] | undefined,
  loadCustomVizPlugin: async (
    _plugin: CustomVizPluginRuntime,
    _cacheBustSuffix?: string,
    _onInfo?: (message: string) => void,
  ) => null as string | null,
  getPluginAssetUrl: (_pluginId: number, _assetPath: string | null) =>
    undefined as string | undefined,
  getCustomVizIconComponent: (_pluginId: CustomVizPluginId) => undefined,
  subscribeToCustomVizIcons:
    (_listener: (pluginId: CustomVizPluginId) => void) => () => {},

  // Must be functional in OSS — pure string check used by getSensibleVisualizations
  isCustomVizDisplay,

  // Static viz rendering (GraalJS context)
  customVizRegistry: new Map<string, Record<string, any>>(),
  registerCustomVizPlugin: (
    _factory: (props: Record<string, unknown>) => Record<string, any>,
    _identifier: string,
    _assets: Record<string, string> | undefined,
  ) => {},
});

export const PLUGIN_CUSTOM_VIZ = getDefaultPluginCustomViz();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_CUSTOM_VIZ, getDefaultPluginCustomViz());
}
