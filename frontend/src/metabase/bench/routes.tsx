import { Route } from "react-router";

import { getMetadataRoutes } from "metabase/metadata/routes";
import { PLUGIN_DEPENDENCIES, PLUGIN_TRANSFORMS } from "metabase/plugins";

import { BenchLayout } from "./pages/BenchLayout";
import { DataSectionLayout } from "./pages/DataSectionLayout";
import { DependenciesSectionLayout } from "./pages/DependenciesSectionLayout";

export function getBenchRoutes() {
  return (
    <Route path="bench" component={BenchLayout}>
      <Route component={DataSectionLayout}>
        {getMetadataRoutes()}
        {PLUGIN_TRANSFORMS.getTransformRoutes()}
      </Route>
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path="dependencies" component={DependenciesSectionLayout}>
          {PLUGIN_DEPENDENCIES.getDependencyGraphRoutes()}
        </Route>
      )}
    </Route>
  );
}
