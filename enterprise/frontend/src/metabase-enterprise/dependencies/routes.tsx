import {
  dependenciesSectionLayout,
  dependenciesUpsellPage,
} from "metabase/data-studio/routes";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

import { loadDependencyGraphPage } from "./lazy";

const dependencyGraphPage = () =>
  loadDependencyGraphPage().then(({ DependencyGraphPage }) => ({
    Component: DependencyGraphPage,
  }));

/**
 * The section layout holds the whole subtree: without the feature it renders the
 * upsell page, which has no `Outlet`, so the graph below it never shows.
 */
export function getDataStudioDependencyRoutes() {
  return (
    <Route
      path="dependencies"
      lazy={featureGatedRoute(
        "dependencies",
        dependenciesSectionLayout,
        dependenciesUpsellPage,
      )}
    >
      <Route index lazy={dependencyGraphPage} />
    </Route>
  );
}
