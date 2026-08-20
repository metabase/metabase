import type { Context, ReactNode } from "react";
import { createContext } from "react";

import { pluginPlaceholderRoute } from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";
import type { GetDependencyGraphRequest } from "metabase-types/api";

// Types
export type DependencyGraphPageContextType = {
  baseUrl?: string;
  defaultEntry?: any;
};

type DependenciesPlugin = {
  isEnabled: boolean;
  getDataStudioDependencyRoutes: () => ReactNode;
  dependencyGraphPage: PluginRoute;
  DependencyGraphPageContext: Context<DependencyGraphPageContextType>;
  useGetDependenciesCount: (args: GetDependencyGraphRequest) => {
    dependenciesCount: number;
    dependentsCount: number;
  };
};

const getDefaultPluginDependencies = (): DependenciesPlugin => ({
  isEnabled: false,
  getDataStudioDependencyRoutes: () => null,
  dependencyGraphPage: pluginPlaceholderRoute,
  DependencyGraphPageContext: createContext({}),
  useGetDependenciesCount: () => ({
    dependenciesCount: 0,
    dependentsCount: 0,
  }),
});

export const PLUGIN_DEPENDENCIES = getDefaultPluginDependencies();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DEPENDENCIES, getDefaultPluginDependencies());
}
