import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type PublicLinkPasswordSectionProps = {
  entityType: "card" | "dashboard";
  entityId: number;
  onRemoveLink?: () => void;
};

const getDefaultPluginPublicLinkPasswords = () => ({
  isEnabled: () => false,
  PasswordSection:
    PluginPlaceholder as ComponentType<PublicLinkPasswordSectionProps>,
});

export const PLUGIN_PUBLIC_LINK_PASSWORDS =
  getDefaultPluginPublicLinkPasswords();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(
    PLUGIN_PUBLIC_LINK_PASSWORDS,
    getDefaultPluginPublicLinkPasswords(),
  );
}
