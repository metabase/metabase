import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

type SecurityCenterNavItemProps = {
  currentPath: string;
};

type SecurityCenterPlugin = {
  isEnabled: boolean;
  SecurityCenterPage: ComponentType;
  SecurityCenterBanner: ComponentType;
  SecurityCenterNavItem: ComponentType<SecurityCenterNavItemProps>;
  SecurityCenterMobileNavItem: ComponentType<SecurityCenterNavItemProps>;
};

const getDefaultPlugin = (): SecurityCenterPlugin => ({
  isEnabled: false,
  SecurityCenterPage: PluginPlaceholder,
  SecurityCenterBanner: PluginPlaceholder,
  SecurityCenterNavItem: PluginPlaceholder,
  SecurityCenterMobileNavItem: PluginPlaceholder,
});

export const PLUGIN_SECURITY_CENTER = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_SECURITY_CENTER, getDefaultPlugin());
}
