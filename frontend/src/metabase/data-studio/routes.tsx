import { DependencyDiagnosticsSectionLayout } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout";
import { DependencyDiagnosticsUpsellPage } from "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsUpsellPage";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
  PLUGIN_SCHEMA_VIEWER,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { Navigate, Route, type RouteComponent } from "metabase/router";
import { getDataStudioTransformRoutes } from "metabase/transforms/routes";
import { canAccessTransforms } from "metabase/transforms/selectors";
import * as Urls from "metabase/urls";

import { DataSectionLayout } from "./app/pages/DataSectionLayout";
import { DataStudioLayout } from "./app/pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./app/pages/DependenciesSectionLayout";
import { GitSyncSectionLayout } from "./app/pages/GitSyncSectionLayout";
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { WorkspacesSectionLayout } from "./app/pages/WorkspacesSectionLayout";
import { getDataStudioMetadataRoutes } from "./data-model/routes";
import { getDataStudioGlossaryRoutes } from "./glossary/routes";
import { getDataStudioSettingsRoutes } from "./settings/routes";
import {
  DependenciesUpsellPage,
  LibraryUpsellPage,
  SchemaViewerUpsellPage,
} from "./upsells/pages";

export function getDataStudioRoutes(
  CanAccessDataStudio: RouteComponent,
  CanAccessDataModel: RouteComponent,
  IsAdmin: RouteComponent,
) {
  return (
    <Route component={CanAccessDataStudio}>
      <Route path="data-studio" component={DataStudioLayout}>
        <Route index component={DataStudioIndexRedirect} />
        <Route path="data" component={CanAccessDataModel}>
          <Route component={DataSectionLayout}>
            {getDataStudioMetadataRoutes(IsAdmin)}
          </Route>
        </Route>
        <Route path="transforms" component={TransformsSectionLayout}>
          {getDataStudioTransformRoutes()}
        </Route>
        <Route component={WorkspacesSectionLayout}>
          {PLUGIN_WORKSPACES.getDataStudioRoutes()}
        </Route>
        {getDataStudioGlossaryRoutes()}
        {getDataStudioSettingsRoutes()}
        {PLUGIN_LIBRARY.isEnabled ? (
          PLUGIN_LIBRARY.getDataStudioLibraryRoutes(IsAdmin)
        ) : (
          <Route path="library" component={LibraryUpsellPage} />
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
        {PLUGIN_SCHEMA_VIEWER.isEnabled ? (
          <Route path="schema-viewer">
            {PLUGIN_SCHEMA_VIEWER.getDataStudioSchemaViewerRoutes()}
          </Route>
        ) : (
          <Route path="schema-viewer" component={SchemaViewerUpsellPage} />
        )}
        <Route path="git-sync" component={GitSyncSectionLayout} />
      </Route>
    </Route>
  );
}

function DataStudioIndexRedirect() {
  const indexPath = useSelector(getIndexPath);
  return <Navigate to={indexPath} replace />;
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
