import type { WidgetMount } from "custom-viz";
import type { ComponentType } from "react";

import type { IconData } from "metabase/common/utils/icon";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { Dispatch } from "metabase/redux/store";
import type {
  CustomVizPluginId,
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards";

// prevents infinite render loop
const noopCustomVizIcon = (
  _display: VisualizationDisplay,
): { icon: IconData | undefined; isLoading: boolean } => ({
  icon: undefined,
  isLoading: false,
});

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
    ({ plugins: undefined, isLoading: false }) as {
      plugins: CustomVizPluginRuntime[] | undefined;
      isLoading: boolean;
    },
  loadCustomVizPlugin: async (
    _plugin: CustomVizPluginRuntime,
    _options?: {
      cacheBustSuffix?: string;
      onInfo?: (message: string) => void;
    },
  ) => null as string | null,
  /**
   * Load (and register) the plugin backing a `custom:*` display, if it is
   * installed and enabled. Resolves to the registered display identifier, or
   * null when the plugin is unavailable. No-op in OSS.
   */
  loadCustomVizPluginForDisplay: async (
    _dispatch: Dispatch,
    _display: string,
  ): Promise<VisualizationDisplay | null> => null,
  getPluginAssetUrl: (
    _pluginId: CustomVizPluginId,
    _assetPath: string | null,
  ) => undefined as string | undefined,

  // Only the SDK really implements these: its icon `<img>` is cross-origin and
  // can't carry the session header, so the sdk fetches the asset with auth, hands back
  // a `blob:` url, and revokes it via `releaseCustomVizAsset`. The main app just
  // builds a plain url.
  resolveCustomVizAssetUrl: (
    _pluginId: CustomVizPluginId,
    _assetPath: string | null | undefined,
  ): Promise<string | undefined> => Promise.resolve(undefined),
  releaseCustomVizAsset: (_pluginId: CustomVizPluginId) => {},

  useCustomVizPluginsIcon: () => noopCustomVizIcon,

  // Must be functional in OSS — pure string check used by getSensibleVisualizations
  isCustomVizDisplay,

  /**
   *  Always false in OSS as there is no plugin to produce a mount handle.
   */
  isWidgetMount: (_value: unknown): _value is WidgetMount => false,

  CustomVizSettingWidget: PluginPlaceholder<{
    mount: WidgetMount;
    widgetProps: Record<string, unknown>;
  }>,
});

export const PLUGIN_CUSTOM_VIZ = getDefaultPluginCustomViz();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_CUSTOM_VIZ, getDefaultPluginCustomViz());
}
