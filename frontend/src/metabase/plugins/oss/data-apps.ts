import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { DataApp } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type DataAppsPlugin = {
  isEnabled: boolean;
  getRoutes: () => ReactNode | null;
  getDataStudioRoutes: (IsAdmin: ComponentType) => ReactNode | null;
  MainNavbarSection: ComponentType<{ onItemSelect: () => void }>;
  /**
   * The data apps the user can read. `data` is undefined until the list loads, and always without the data apps
   * feature. With `skip`, or without the feature, it sends no request.
   */
  useDataApps: (options: { skip: boolean }) => {
    data?: DataApp[];
    isLoading: boolean;
    error?: unknown;
  };
};

const getDefaultPluginDataApps = (): DataAppsPlugin => ({
  isEnabled: false,
  getRoutes: () => null,
  getDataStudioRoutes: () => null,
  MainNavbarSection: PluginPlaceholder,
  useDataApps: () => ({ data: undefined, isLoading: false }),
});

export const PLUGIN_DATA_APPS: DataAppsPlugin = definePluginSlot(
  getDefaultPluginDataApps,
);
