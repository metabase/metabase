import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { IndexRoute, Route } from "react-router";

import * as Urls from "metabase/lib/urls";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { State } from "metabase-types/store";

import { DataSectionLayout } from "./app/pages/DataSectionLayout";
import { DataStudioLayout } from "./app/pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./app/pages/DependenciesSectionLayout";
import { DependencyDiagnosticsSectionLayout } from "./app/pages/DependencyDiagnosticsSectionLayout";
import { LibrarySectionLayout } from "./app/pages/LibrarySectionLayout";
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { WorkspacesSectionLayout } from "./app/pages/WorkspacesSectionLayout";
import { getDataStudioMetadataRoutes } from "./data-model/routes";
import { getDataStudioGlossaryRoutes } from "./glossary/routes";
import { getDataStudioMetricRoutes } from "./metrics/routes";
import { getDataStudioSegmentRoutes } from "./segments/routes";
import { getDataStudioSnippetRoutes } from "./snippets/routes";
import { getDataStudioTableRoutes } from "./tables/routes";
import { getDataStudioWorkspaceRoutes } from "./workspaces/routes";

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
              {PLUGIN_TRANSFORMS.getDataStudioTransformRoutes()}
            </Route>
          </Route>
        )}
        {getDataStudioGlossaryRoutes()}
        <Route path="library">
          <IndexRoute component={LibrarySectionLayout} />
          {getDataStudioTableRoutes()}
          {getDataStudioMetricRoutes()}
          {getDataStudioSegmentRoutes()}
          {getDataStudioSnippetRoutes()}
        </Route>
        {hasPremiumFeature("workspaces") && (
          <Route path="workspaces" component={WorkspacesSectionLayout}>
            {getDataStudioWorkspaceRoutes()}
          </Route>
        )}
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
  if (PLUGIN_TRANSFORMS.canAccessTransforms(state)) {
    return Urls.transformList();
  }
  return Urls.dataStudioLibrary();
}
