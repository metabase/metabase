import type { ComponentType, Context, ReactNode } from "react";
import { createContext } from "react";

import { NotFoundPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";
import type { GetDependencyGraphRequest } from "metabase-types/api";

import { definePluginSlot } from "../slot";

// Types
export type DependencyGraphPageContextType = {
  baseUrl?: string;
  defaultEntry?: any;
};

type DependenciesPlugin = {
  isEnabled: boolean;
  /** The section page over the dependency routes; a plugin fills it in. */
  dependenciesSectionPage?: PluginRoute;
  getDataStudioDependencyRoutes: () => ReactNode;
  DependencyGraphPage: ComponentType;
  DependencyGraphPageContext: Context<DependencyGraphPageContextType>;
  useGetDependenciesCount: (args: GetDependencyGraphRequest) => {
    dependenciesCount: number;
    dependentsCount: number;
  };
};

const getDefaultPluginDependencies = (): DependenciesPlugin => ({
  isEnabled: false,
  getDataStudioDependencyRoutes: () => null,
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
