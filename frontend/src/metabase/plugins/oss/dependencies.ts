import type { ComponentType, Context, ReactNode } from "react";
import { createContext } from "react";

import { NotFoundPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { GetDependencyGraphRequest } from "metabase-types/api";

import { definePluginSlot } from "../slot";

// Types
export type DependencyGraphPageContextType = {
  baseUrl?: string;
  defaultEntry?: any;
};

type DependenciesPlugin = {
  isEnabled: boolean;
  // Optional, not a no-op default: an OSS build has no plugin to fill this, and
  // the mount reads the absence to put its upsell page in its place.
  getDataStudioDependencyRoutes?: () => ReactNode;
  DependencyGraphPage: ComponentType;
  DependencyGraphPageContext: Context<DependencyGraphPageContextType>;
  useGetDependenciesCount: (args: GetDependencyGraphRequest) => {
    dependenciesCount: number;
    dependentsCount: number;
  };
};

const getDefaultPluginDependencies = (): DependenciesPlugin => ({
  isEnabled: false,
  DependencyGraphPage: NotFoundPlaceholder,
  DependencyGraphPageContext: createContext({}),
  useGetDependenciesCount: () => ({
    dependenciesCount: 0,
    dependentsCount: 0,
  }),
});

export const PLUGIN_DEPENDENCIES = definePluginSlot(
  getDefaultPluginDependencies,
);
