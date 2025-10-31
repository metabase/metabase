import { IndexRedirect, IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES, PLUGIN_TRANSFORMS } from "metabase/plugins";

import { BenchLayout } from "./pages/BenchLayout";
import { DataSectionLayout } from "./pages/DataSectionLayout";
import { DependencySectionLayout } from "./pages/DependencySectionLayout";

export function getBenchRoutes() {
  return (
    <Route path="bench" component={BenchLayout}>
      <IndexRedirect to="data" />
      <Route path="data" component={DataSectionLayout}>
        {PLUGIN_TRANSFORMS.getBenchRoutes()}
      </Route>
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path="dependencies" component={DependencySectionLayout}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
