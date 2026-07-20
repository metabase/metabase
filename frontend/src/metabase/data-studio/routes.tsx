import { NotFound } from "metabase/common/components/ErrorPages";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
  PLUGIN_SCHEMA_VIEWER,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import {
  Navigate,
  Route,
  type RouteComponent,
  redirect,
  withRouteProps,
} from "metabase/router";
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

const RoutedTransformsSectionLayout = withRouteProps(TransformsSectionLayout);

export function getDataStudioRoutes(
  CanAccessDataStudio: RouteComponent,
  CanAccessDataModel: RouteComponent,
  IsAdmin: RouteComponent,
) {
  return (
    <>
      {getDataStudioDependencyDiagnosticsRedirects()}
      <Route element={<CanAccessDataStudio />}>
        <Route path="data-studio" element={<DataStudioLayout />}>
          <Route index element={<DataStudioIndexRedirect />} />
          <Route path="data" element={<CanAccessDataModel />}>
            <Route element={<DataSectionLayout />}>
              {getDataStudioMetadataRoutes(IsAdmin)}
            </Route>
          </Route>
          <Route path="transforms" element={<RoutedTransformsSectionLayout />}>
            {getDataStudioTransformRoutes()}
          </Route>
          <Route element={<WorkspacesSectionLayout />}>
            {PLUGIN_WORKSPACES.getDataStudioRoutes()}
          </Route>
          {getDataStudioGlossaryRoutes()}
          {getDataStudioSettingsRoutes()}
          {PLUGIN_LIBRARY.isEnabled ? (
            PLUGIN_LIBRARY.getDataStudioLibraryRoutes(IsAdmin)
          ) : (
            <Route path="library" element={<LibraryUpsellPage />} />
          )}
          {PLUGIN_DEPENDENCIES.isEnabled ? (
            <Route path="dependencies" element={<DependenciesSectionLayout />}>
              {PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes()}
            </Route>
          ) : (
            <Route path="dependencies" element={<DependenciesUpsellPage />} />
          )}
          {PLUGIN_SCHEMA_VIEWER.isEnabled ? (
            <Route path="schema-viewer">
              {PLUGIN_SCHEMA_VIEWER.getDataStudioSchemaViewerRoutes()}
            </Route>
          ) : (
            <Route path="schema-viewer" element={<SchemaViewerUpsellPage />} />
          )}
          <Route path="git-sync" element={<GitSyncSectionLayout />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </>
  );
}

/**
 * Dependency Diagnostics moved from Data Studio to Monitor. These redirects sit
 * OUTSIDE the CanAccessDataStudio guard — users without Data Studio access must
 * still be forwarded (the guard would otherwise bounce them to /unauthorized) —
 * and are declared BEFORE the guarded subtree so they win over its `path="*"`
 * catch-all (first full match in declaration order wins), which would otherwise
 * shadow them with a NotFound inside the Data Studio layout.
 */
export function getDataStudioDependencyDiagnosticsRedirects() {
  return (
    <>
      <Route
        path="data-studio/dependency-diagnostics"
        element={redirect(Urls.dependencyDiagnostics())}
      />
      <Route
        path="data-studio/dependency-diagnostics/*"
        element={redirect(`${Urls.dependencyDiagnostics()}/*`)}
      />
    </>
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
