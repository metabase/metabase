import { Route } from "metabase/hoc/Title";
import { getMetadataRoutes } from "metabase/metadata/routes";
import { PLUGIN_DEPENDENCIES, PLUGIN_TRANSFORMS } from "metabase/plugins";

import { BenchLayout } from "./pages/BenchLayout";
import { DataSectionLayout } from "./pages/DataSectionLayout";
import { DependenciesSectionLayout } from "./pages/DependenciesSectionLayout";
import { ModelingSectionLayout } from "./pages/ModelingSectionLayout";

export function getWorkbenchRoutes() {
  return (
    <Route component={BenchLayout}>
      <Route component={DataSectionLayout}>
        {getMetadataRoutes()}
        {PLUGIN_TRANSFORMS.getTransformRoutes()}
      </Route>
      <Route component={ModelingSectionLayout} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          title={`Dependency graph`}
          path="dependencies"
          component={DependenciesSectionLayout}
        >
          {PLUGIN_DEPENDENCIES.getDependencyGraphRoutes()}
        </Route>
      )}
    </Route>
  );
}
