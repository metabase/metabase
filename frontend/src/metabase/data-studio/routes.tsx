import { IndexRedirect } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import { getDataStudioMetadataRoutes } from "metabase/metadata/routes";
import { getDataStudioModelRoutes } from "metabase/models/routes";
import { PLUGIN_DEPENDENCIES, PLUGIN_TRANSFORMS } from "metabase/plugins";

import { DataSectionLayout } from "./pages/DataSectionLayout";
import { DataStudioLayout } from "./pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./pages/DependenciesSectionLayout";
import { ModelingSectionLayout } from "./pages/ModelingSectionLayout";

export function getDataStudioRoutes() {
  return (
    <Route component={DataStudioLayout}>
      <IndexRedirect to="data" />
      <Route title={t`Data`} path="data" component={DataSectionLayout}>
        {getDataStudioMetadataRoutes()}
      </Route>
      {PLUGIN_TRANSFORMS.isEnabled && (
        <Route
          title={t`Transforms`}
          path="transforms"
          component={DataSectionLayout}
        >
          {PLUGIN_TRANSFORMS.getDataStudioTransformRoutes()}
        </Route>
      )}
      <Route
        title={t`Modeling`}
        path="modeling"
        component={ModelingSectionLayout}
      >
        {getDataStudioModelRoutes()}
      </Route>
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          title={t`Dependency graph`}
          path="dependencies"
          component={DependenciesSectionLayout}
        >
          {PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes()}
        </Route>
      )}
    </Route>
  );
}
