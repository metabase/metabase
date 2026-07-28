import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type MetabaseAIProviderSetupProps = {
  onConnect?: VoidFunction;
};

const getDefaultPluginMetabot = () => ({
  isEnabled: false,
  MetabaseAIProviderSetup:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<MetabaseAIProviderSetupProps>,
  useOnProviderRemoved: () => async (_providerType: string) => {},
});

export const PLUGIN_METABOT: {
  isEnabled: boolean;
  MetabaseAIProviderSetup: ComponentType<MetabaseAIProviderSetupProps>;
  useOnProviderRemoved: () => (providerType: string) => Promise<void>;
} = getDefaultPluginMetabot();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_METABOT, getDefaultPluginMetabot());
}
