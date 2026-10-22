import type { ComponentType } from "react";

import {
  PluginPlaceholder,
  pluginPlaceholderRoute,
} from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";

import { definePluginSlot } from "../slot";

type SecurityCenterNavItemProps = {
  currentPath: string;
};

type SecurityCenterPlugin = {
  isEnabled: boolean;
  securityCenterPage: PluginRoute;
  SecurityCenterBanner: ComponentType;
  SecurityCenterPromoCard: ComponentType;
  SecurityCenterNavItem: ComponentType<SecurityCenterNavItemProps>;
  SecurityCenterMobileNavItem: ComponentType<SecurityCenterNavItemProps>;
};

const getDefaultPlugin = (): SecurityCenterPlugin => ({
  isEnabled: false,
  securityCenterPage: pluginPlaceholderRoute,
  SecurityCenterBanner: PluginPlaceholder,
  SecurityCenterPromoCard: PluginPlaceholder,
  SecurityCenterNavItem: PluginPlaceholder,
  SecurityCenterMobileNavItem: PluginPlaceholder,
});

export const PLUGIN_SECURITY_CENTER = definePluginSlot(getDefaultPlugin);
