import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { IndexRoute, Route } from "react-router";

import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { getDataStudioTransformRoutes } from "metabase/transforms/routes";
import { canAccessTransforms } from "metabase/transforms/selectors";
import * as Urls from "metabase/utils/urls";

import { DataSectionLayout } from "./app/pages/DataSectionLayout";
import { DataStudioLayout } from "./app/pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./app/pages/DependenciesSectionLayout";
import { DependencyDiagnosticsSectionLayout } from "./app/pages/DependencyDiagnosticsSectionLayout";
import { GitSyncSectionLayout } from "./app/pages/GitSyncSectionLayout";
import { MeasuresSectionLayout } from "./app/pages/MeasuresSectionLayout";
import { MetricsSectionLayout } from "./app/pages/MetricsSectionLayout";
import { SegmentsSectionLayout } from "./app/pages/SegmentsSectionLayout";
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { WorkspacesSectionLayout } from "./app/pages/WorkspacesSectionLayout";
import { getDataStudioMetadataRoutes } from "./data-model/routes";
import { getDataStudioGlossaryRoutes } from "./glossary/routes";
import { MeasureListPage } from "./measures/pages/MeasureListPage/MeasureListPage";
import { MetricListPage } from "./metrics/pages/MetricListPage/MetricListPage";
import { SegmentListPage } from "./segments/pages/SegmentListPage/SegmentListPage";
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
        <Route path="metrics" component={MetricsSectionLayout}>
          <IndexRoute component={MetricListPage} />
        </Route>
        <Route path="segments" component={SegmentsSectionLayout}>
          <IndexRoute component={SegmentListPage} />
        </Route>
        <Route path="measures" component={MeasuresSectionLayout}>
          <IndexRoute component={MeasureListPage} />
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
