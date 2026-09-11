import type { ComponentType } from "react";

import { definePluginSlot } from "metabase/plugin-slots";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginAdminSettings = () => ({
  InteractiveEmbeddingSettingsCard: null,
  LicenseAndBillingSettings: PluginPlaceholder,
  useUpsellFlow: (_props: {
    campaign: string;
    location: string;
  }): {
    triggerUpsellFlow: (() => void) | undefined;
  } => ({
    triggerUpsellFlow: undefined,
  }),
});

export const PLUGIN_ADMIN_SETTINGS: {
  InteractiveEmbeddingSettingsCard: ComponentType | null;
  LicenseAndBillingSettings: ComponentType;
  useUpsellFlow: (props: { campaign: string; location: string }) => {
    triggerUpsellFlow: (() => void) | undefined;
  };
} = definePluginSlot(getDefaultPluginAdminSettings);
