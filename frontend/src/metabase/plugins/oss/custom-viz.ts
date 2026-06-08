import type { WidgetMount } from "custom-viz";
import type { ComponentType } from "react";

import type { IconData } from "metabase/common/utils/icon";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type {
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
  getPluginAssetUrl: (_pluginId: number, _assetPath: string | null) =>
    undefined as string | undefined,
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
