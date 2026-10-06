import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import { definePluginSlot } from "../slot";

export type DataAppsPlugin = {
  isEnabled: boolean;
  getRoutes: () => ReactNode | null;
  ManageDataAppsPage: ComponentType;
  ManageDataAppUsersPage: ComponentType;
  MainNavbarSection: ComponentType<{ onItemSelect: () => void }>;
};

const getDefaultPluginDataApps = (): DataAppsPlugin => ({
  isEnabled: false,
  getRoutes: () => null,
  ManageDataAppsPage: PluginPlaceholder,
  ManageDataAppUsersPage: PluginPlaceholder,
  MainNavbarSection: PluginPlaceholder,
});

export const PLUGIN_DATA_APPS: DataAppsPlugin = definePluginSlot(
  getDefaultPluginDataApps,
);
