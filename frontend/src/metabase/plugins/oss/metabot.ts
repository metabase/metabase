import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

type MetabaseAIProviderSetupProps = {
  isMetabaseProviderConnected: boolean;
  isSavingMetabaseConnection: boolean;
  onConnect: () => Promise<void>;
};

const getDefaultPluginMetabot = () => ({
  MetabaseAIProviderSetup:
    PluginPlaceholder as ComponentType<MetabaseAIProviderSetupProps>,
});

export const PLUGIN_METABOT: {
  MetabaseAIProviderSetup: ComponentType<MetabaseAIProviderSetupProps>;
} = getDefaultPluginMetabot();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_METABOT, getDefaultPluginMetabot());
}
