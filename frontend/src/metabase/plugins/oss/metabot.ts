import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginMetabot = () => ({
  isEnabled: false,
  MetabaseAIProviderSetup: PluginPlaceholder as ComponentType,
});

export const PLUGIN_METABOT: {
  isEnabled: boolean;
  MetabaseAIProviderSetup: ComponentType;
} = getDefaultPluginMetabot();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_METABOT, getDefaultPluginMetabot());
}
