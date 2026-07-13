import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type DataAppsMainNavbarSectionProps = {
  onItemSelect: () => void;
};

const getDefaultPluginDataApps = () => ({
  isEnabled: false,
  getRoutes: () => null as ReactNode | null,
  ManageDataAppsPage: PluginPlaceholder as ComponentType,
  MainNavbarSection:
    PluginPlaceholder as ComponentType<DataAppsMainNavbarSectionProps>,
});

export const PLUGIN_DATA_APPS: {
  isEnabled: boolean;
  getRoutes: () => ReactNode | null;
  ManageDataAppsPage: ComponentType;
  MainNavbarSection: ComponentType<DataAppsMainNavbarSectionProps>;
} = getDefaultPluginDataApps();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DATA_APPS, getDefaultPluginDataApps());
}
