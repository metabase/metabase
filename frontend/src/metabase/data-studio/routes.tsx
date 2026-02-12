import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { IndexRoute, Route } from "react-router";

import * as Urls from "metabase/lib/urls";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
  PLUGIN_REPLACEMENT,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import { getDataStudioTransformRoutes } from "metabase/transforms/routes";
import { canAccessTransforms } from "metabase/transforms/selectors";
import type { State } from "metabase-types/store";

import { DataSectionLayout } from "./app/pages/DataSectionLayout";
import { DataStudioLayout } from "./app/pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./app/pages/DependenciesSectionLayout";
import { DependencyDiagnosticsSectionLayout } from "./app/pages/DependencyDiagnosticsSectionLayout";
import { GitSyncSectionLayout } from "./app/pages/GitSyncSectionLayout";
import { ReplaceDataSourceSectionLayout } from "./app/pages/ReplaceDataSourceSectionLayout";
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { WorkspacesSectionLayout } from "./app/pages/WorkspacesSectionLayout";
import { getDataStudioMetadataRoutes } from "./data-model/routes";
import { getDataStudioGlossaryRoutes } from "./glossary/routes";
import {
  DependenciesUpsellPage,
  DependencyDiagnosticsUpsellPage,
  LibraryUpsellPage,
} from "./upsells/pages";

export function getDataStudioRoutes(
  store: Store<State>,
  CanAccessDataStudio: ComponentType,
  CanAccessDataModel: ComponentType,
  _CanAccessTransforms: ComponentType,
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
        <Route path="transforms" component={TransformsSectionLayout}>
          {getDataStudioTransformRoutes()}
        </Route>
        {getDataStudioGlossaryRoutes()}
        {PLUGIN_LIBRARY.isEnabled ? (
          PLUGIN_LIBRARY.getDataStudioLibraryRoutes()
        ) : (
          <Route path="library" component={LibraryUpsellPage} />
        )}
        {PLUGIN_WORKSPACES.isEnabled && (
          <Route path="workspaces" component={WorkspacesSectionLayout}>
            {PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes()}
          </Route>
        )}
        {PLUGIN_DEPENDENCIES.isEnabled ? (
          <Route path="dependencies" component={DependenciesSectionLayout}>
            {PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes()}
          </Route>
        ) : (
          <Route path="dependencies" component={DependenciesUpsellPage} />
        )}
        {PLUGIN_DEPENDENCIES.isEnabled ? (
          <Route
            path="dependency-diagnostics"
            component={DependencyDiagnosticsSectionLayout}
          >
            {PLUGIN_DEPENDENCIES.getDataStudioDependencyDiagnosticsRoutes()}
          </Route>
        ) : (
          <Route
            path="dependency-diagnostics"
            component={DependencyDiagnosticsUpsellPage}
          />
        )}
        <Route path="git-sync" component={GitSyncSectionLayout} />
        {PLUGIN_REPLACEMENT.isEnabled && (
          <Route
            path="replace-data-source"
            component={ReplaceDataSourceSectionLayout}
          >
            {PLUGIN_REPLACEMENT.getReplaceDataSourceRoutes()}
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
