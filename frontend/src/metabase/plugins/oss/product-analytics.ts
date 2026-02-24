import type { ReactNode } from "react";

export const getDefaultPluginProductAnalytics = () => ({
  isEnabled: false,
  getAdminRoutes: () => null as ReactNode,
});

export const PLUGIN_PRODUCT_ANALYTICS = getDefaultPluginProductAnalytics();

export function reinitialize() {
  Object.assign(PLUGIN_PRODUCT_ANALYTICS, getDefaultPluginProductAnalytics());
}
