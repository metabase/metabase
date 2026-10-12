import { notFoundRoute } from "metabase/plugins/components/PluginPlaceholder";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

import { loadDependencyGraphRoute } from "./lazy";

export function getDataStudioDependencyRoutes() {
  return (
    <Route
      index
      lazy={featureGatedRoute(
        "dependencies",
        loadDependencyGraphRoute,
        notFoundRoute,
      )}
    />
  );
}
