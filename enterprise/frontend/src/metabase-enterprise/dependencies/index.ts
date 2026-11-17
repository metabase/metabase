import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useGetDependenciesCount } from "./hooks/use-get-dependencies-count";
import { LazyDependencyGraphPage, loadDependencyGraphPage } from "./lazy";
import { getDataStudioDependencyRoutes } from "./routes";

/**
 * Initialize dependencies plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_DEPENDENCIES.isEnabled = true;
    PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes =
      getDataStudioDependencyRoutes;
    PLUGIN_DEPENDENCIES.DependencyGraphPage = LazyDependencyGraphPage;
    PLUGIN_DEPENDENCIES.useGetDependenciesCount = useGetDependenciesCount;

    // Hovering a link to the graph starts its fetch, so the chunk is usually in
    // hand by the time the click lands. Only the Data Studio path is registered:
    // the per-entity dependency tabs carry an entity id before the segment that
    // names them, so no prefix can single them out.
    registerPagePrefetch(Urls.dependencyGraph(), loadDependencyGraphPage);
  }
}
