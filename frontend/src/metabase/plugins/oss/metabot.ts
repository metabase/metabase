import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type MetabaseAIProviderSetupProps = {
  onClose?: VoidFunction;
};

const getDefaultPluginMetabot = () => ({
  isEnabled: false,
  MetabaseAIProviderSetup:
    PluginPlaceholder as ComponentType<MetabaseAIProviderSetupProps>,
});

export const PLUGIN_METABOT: {
  isEnabled: boolean;
  MetabaseAIProviderSetup: ComponentType<MetabaseAIProviderSetupProps>;
} = getDefaultPluginMetabot();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_METABOT, getDefaultPluginMetabot());
}
