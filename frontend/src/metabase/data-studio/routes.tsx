import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { IndexRoute, Route } from "react-router";

import { DependencyDiagnosticsSectionLayout } from "metabase/data-studio/app/pages/TasksSectionLayout/TasksSectionLayout";
import * as Urls from "metabase/lib/urls";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { getDataStudioTransformRoutes } from "metabase/transforms/routes";
import { canAccessTransforms } from "metabase/transforms/selectors";
import type { State } from "metabase-types/store";

import { DataSectionLayout } from "./app/pages/DataSectionLayout";
import { DataStudioLayout } from "./app/pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./app/pages/DependenciesSectionLayout";
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { getDataStudioMetadataRoutes } from "./data-model/routes";
import { getDataStudioGlossaryRoutes } from "./glossary/routes";

export function getDataStudioRoutes(
  store: Store<State>,
  CanAccessDataStudio: ComponentType,
  CanAccessDataModel: ComponentType,
  CanAccessTransforms: ComponentType,
) {
  return (
    <Route component={CanAccessDataStudio}>
      <Route path="data-studio" component={DataStudioLayout}>
        <IndexRoute
          onEnter={(_state, replace) => {
            replace(getIndexPath(store.getState()));
          }}
        />
        <Route path="data" component={CanAccessDataModel}>
          <Route component={DataSectionLayout}>
            {getDataStudioMetadataRoutes()}
          </Route>
        </Route>
        {PLUGIN_TRANSFORMS.isEnabled && (
          <Route path="transforms" component={CanAccessTransforms}>
            <Route component={TransformsSectionLayout}>
              {getDataStudioTransformRoutes()}
            </Route>
          </Route>
        )}
        {getDataStudioGlossaryRoutes()}
        {PLUGIN_LIBRARY.isEnabled &&
          PLUGIN_LIBRARY.getDataStudioLibraryRoutes()}
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route path="dependencies" component={DependenciesSectionLayout}>
            {PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes()}
          </Route>
        )}
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route
            path="dependency-diagnostics"
            component={DependencyDiagnosticsSectionLayout}
          >
            {PLUGIN_DEPENDENCIES.getDataStudioDependencyDiagnosticsRoutes()}
          </Route>
        )}
      </Route>
    </Route>
  );
}

function getIndexPath(state: State) {
  if (PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state)) {
    return Urls.dataStudioData();
  }
  if (canAccessTransforms(state)) {
    return Urls.transformList();
  }
  return Urls.dataStudioLibrary();
}
