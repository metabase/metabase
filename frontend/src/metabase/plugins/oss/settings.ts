import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export const PLUGIN_ADMIN_SETTINGS: {
  InteractiveEmbeddingSettings: ComponentType | null;
  LicenseAndBillingSettings: ComponentType;
  useUpsellFlow: (props: { campaign: string; location: string }) => {
    triggerUpsellFlow: (() => void) | undefined;
  };
} = {
  InteractiveEmbeddingSettings: null,
  LicenseAndBillingSettings: PluginPlaceholder,
  useUpsellFlow: (_props: {
    campaign: string;
    location: string;
  }): {
    triggerUpsellFlow: (() => void) | undefined;
  } => ({
    triggerUpsellFlow: undefined,
  }),
};
