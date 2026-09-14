import type { ComponentType } from "react";

import { definePluginSlot } from "metabase/plugin-slots";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginAdminSettings = () => ({
  // The origins list is its own card on the hub's Security tab, below the
  // methods card, so it is registered separately from the settings card.
  InteractiveEmbeddingAuthorizedOriginsWidget: null,
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
  InteractiveEmbeddingAuthorizedOriginsWidget: ComponentType | null;
  LicenseAndBillingSettings: ComponentType;
  useUpsellFlow: (props: { campaign: string; location: string }) => {
    triggerUpsellFlow: (() => void) | undefined;
  };
} = definePluginSlot(getDefaultPluginAdminSettings);
