import type { ComponentType, ReactNode } from "react";

import { definePluginSlot } from "metabase/plugin-slots";
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

export const PLUGIN_DATA_APPS: DataAppsPlugin = definePluginSlot(
  getDefaultPluginDataApps,
);
