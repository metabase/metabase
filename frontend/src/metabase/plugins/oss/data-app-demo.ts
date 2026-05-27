import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginDataAppDemo = () => ({
  AppView: PluginPlaceholder as ComponentType<{ params: { name: string } }>,
  ManageDataAppsPage: PluginPlaceholder as ComponentType<Record<string, never>>,
  DataAppFormPage: PluginPlaceholder as ComponentType<Record<string, never>>,
});

export const PLUGIN_DATA_APP_DEMO = getDefaultPluginDataAppDemo();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DATA_APP_DEMO, getDefaultPluginDataAppDemo());
}
