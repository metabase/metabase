import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginAdminSettings = () => ({
  InteractiveEmbeddingSettingsCard: null,
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
  InteractiveEmbeddingSettingsCard: ComponentType | null;
  InteractiveEmbeddingAuthorizedOriginsWidget: ComponentType | null;
  LicenseAndBillingSettings: ComponentType;
  useUpsellFlow: (props: { campaign: string; location: string }) => {
    triggerUpsellFlow: (() => void) | undefined;
  };
} = getDefaultPluginAdminSettings();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_ADMIN_SETTINGS, getDefaultPluginAdminSettings());
}
