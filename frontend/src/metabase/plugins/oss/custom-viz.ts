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
    _cacheBustSuffix?: string,
    _onInfo?: (message: string) => void,
  ) => null as string | null,
  getPluginAssetUrl: (_pluginId: number, _assetPath: string | null) =>
    undefined as string | undefined,
  useCustomVizPluginsIcon: () => noopCustomVizIcon,

  // Must be functional in OSS — pure string check used by getSensibleVisualizations
  isCustomVizDisplay,

  /**
   * Predicate used by ChartSettingsWidget to decide whether the `widget`
   * field is a custom-viz mount handle (drive lifecycle imperatively) or a
   * plain React component (render directly). Always false in OSS — there
   * is no plugin to produce a mount handle.
   */
  isWidgetMount: ((_value: unknown) => false) as (
    value: unknown,
  ) => value is WidgetMount,

  /**
   * Host driver that renders a custom-viz setting widget by calling the
   * plugin's mount/update/unmount handle through the near-membrane
   * boundary. Placeholder in OSS — never invoked because `isWidgetMount`
   * always returns false there.
   */
  SettingWidget: PluginPlaceholder as ComponentType<{
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
