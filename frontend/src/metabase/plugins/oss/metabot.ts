import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import { definePluginSlot } from "../slot";

export type MetabaseAIProviderSetupProps = {
  onConnect?: VoidFunction;
  onCancel?: VoidFunction;
  isConnected?: boolean;
};

const getDefaultPluginMetabot = () => ({
  isEnabled: false,
  MetabaseAIProviderSetup:
    // Unjustified type cast. FIXME
    PluginPlaceholder as ComponentType<MetabaseAIProviderSetupProps>,
  hasMetabaseManagedProviderDetails: () => false,
});

export const PLUGIN_METABOT: {
  isEnabled: boolean;
  MetabaseAIProviderSetup: ComponentType<MetabaseAIProviderSetupProps>;
  hasMetabaseManagedProviderDetails: () => boolean;
} = definePluginSlot(getDefaultPluginMetabot);
