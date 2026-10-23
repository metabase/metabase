import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import { definePluginSlot } from "../slot";

export type DataAppsPlugin = {
  isEnabled: boolean;
  getRoutes: () => ReactNode | null;
  getDataStudioRoutes: (IsAdmin: ComponentType) => ReactNode | null;
  MainNavbarSection: ComponentType<{ onItemSelect: () => void }>;
};

const getDefaultPluginDataApps = (): DataAppsPlugin => ({
  isEnabled: false,
  getRoutes: () => null,
  getDataStudioRoutes: () => null,
  MainNavbarSection: PluginPlaceholder,
});

export const PLUGIN_DATA_APPS: DataAppsPlugin = definePluginSlot(
  getDefaultPluginDataApps,
);
