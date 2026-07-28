import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { withRouteProps } from "metabase/router";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useGetDependenciesCount } from "./hooks/use-get-dependencies-count";
import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import { getDataStudioDependencyRoutes } from "./routes";

/**
 * Initialize dependencies plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_DEPENDENCIES.isEnabled = true;
    PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes =
      getDataStudioDependencyRoutes;
    PLUGIN_DEPENDENCIES.DependencyGraphPage =
      withRouteProps(DependencyGraphPage);
    PLUGIN_DEPENDENCIES.useGetDependenciesCount = useGetDependenciesCount;
  }
}
