import type { ComponentType, Context, ReactNode } from "react";
import { createContext } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { GetDependencyGraphRequest } from "metabase-types/api";

// Types
export type DependencyGraphPageContextType = {
  baseUrl?: string;
  defaultEntry?: any;
};

type DependenciesPlugin = {
  isEnabled: boolean;
  getDataStudioDependencyRoutes: () => ReactNode;
  getDataStudioDependencyDiagnosticsRoutes: () => ReactNode;
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
  getDataStudioDependencyDiagnosticsRoutes: () => null,
  DependencyGraphPage: PluginPlaceholder,
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
