import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginDataApps = () => ({
  isEnabled: false,
  getRoutes: () => null as ReactNode | null,
  ManageDataAppsPage: PluginPlaceholder as ComponentType,
});

export const PLUGIN_DATA_APPS: {
  isEnabled: boolean;
  getRoutes: () => ReactNode | null;
  ManageDataAppsPage: ComponentType;
} = getDefaultPluginDataApps();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DATA_APPS, getDefaultPluginDataApps());
}
