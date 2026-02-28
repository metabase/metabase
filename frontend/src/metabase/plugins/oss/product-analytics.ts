import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export const getDefaultPluginProductAnalytics = () => ({
  isEnabled: false,
  getAdminRoutes: () => null as ReactNode,
  ProductAnalyticsNavItem: PluginPlaceholder as ComponentType,
});

export const PLUGIN_PRODUCT_ANALYTICS = getDefaultPluginProductAnalytics();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_PRODUCT_ANALYTICS, getDefaultPluginProductAnalytics());
}
