import { Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { BenchLayout } from "./pages/BenchLayout";
import { DataSectionLayout } from "./pages/DataSectionLayout";

export function getBenchRoutes() {
  return (
    <Route path="bench" component={BenchLayout}>
      <Route path="data" component={DataSectionLayout} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="dependencies"
          component={PLUGIN_DEPENDENCIES.DependencyGraphPage}
        />
      )}
    </Route>
  );
}
