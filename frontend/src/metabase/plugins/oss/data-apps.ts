import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type DataAppsPlugin = {
  isEnabled: boolean;
  getRoutes: () => ReactNode | null;
  ManageDataAppsPage: ComponentType;
  MainNavbarSection: ComponentType<{ onItemSelect: () => void }>;
};

const getDefaultPluginDataApps = (): DataAppsPlugin => ({
  isEnabled: false,
  getRoutes: () => null,
  ManageDataAppsPage: PluginPlaceholder,
  MainNavbarSection: PluginPlaceholder,
});

export const PLUGIN_DATA_APPS: DataAppsPlugin = getDefaultPluginDataApps();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DATA_APPS, getDefaultPluginDataApps());
}
