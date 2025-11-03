import { IndexRedirect } from "react-router";

import { Route } from "metabase/hoc/Title";
import { getMetadataRoutes } from "metabase/metadata/routes";
import { PLUGIN_DEPENDENCIES, PLUGIN_TRANSFORMS } from "metabase/plugins";

import { DataSectionLayout } from "./pages/DataSectionLayout";
import { DataStudioLayout } from "./pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./pages/DependenciesSectionLayout";

export function getDataStudioRoutes() {
  return (
    <Route component={DataStudioLayout}>
      <IndexRedirect to="data" />
      <Route component={DataSectionLayout}>
        {getMetadataRoutes()}
        {PLUGIN_TRANSFORMS.getTransformRoutes()}
      </Route>
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
