import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useUserKeyValue } from "metabase/current-user";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
  PLUGIN_SCHEMA_VIEWER,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import {
  Navigate,
  Route,
  type RouteComponent,
  redirect,
} from "metabase/router";
import { getDataStudioTransformRoutes } from "metabase/transforms/routes";
import { canAccessTransforms } from "metabase/transforms/selectors";
import * as Urls from "metabase/urls";

import { getDataStudioMetadataRoutes } from "./data-model/routes";
import { getDataStudioGlossaryRoutes } from "./glossary/routes";
import { GuidePage } from "./guide/pages/GuidePage/GuidePage";
import { CanAccessDataModel, CanAccessDataStudio } from "./route-guards";
import { getDataStudioSettingsRoutes } from "./settings/routes";

/**
 * The Data Studio layouts and upsell pages, in their own chunk. The route guards
 * stay eager: they have to decide before there is anything to show.
 */
const dataStudioLayout = () =>
  import(
    /* webpackChunkName: "data-studio" */ "./app/pages/DataStudioLayout"
  ).then(({ DataStudioLayout }) => ({
    Component: DataStudioLayout,
  }));

const dataSectionLayout = () =>
  import(
    /* webpackChunkName: "data-studio" */ "./app/pages/DataSectionLayout"
  ).then(({ DataSectionLayout }) => ({
    Component: DataSectionLayout,
  }));

const transformsSectionLayout = () =>
  import(
    /* webpackChunkName: "data-studio" */ "./app/pages/TransformsSectionLayout"
  ).then(({ TransformsSectionLayout }) => ({
    Component: TransformsSectionLayout,
  }));

const dependenciesSectionLayout = () =>
  import(
    /* webpackChunkName: "data-studio" */ "./app/pages/DependenciesSectionLayout"
  ).then(({ DependenciesSectionLayout }) => ({
    Component: DependenciesSectionLayout,
  }));

const gitSyncSectionLayout = () =>
  import(
    /* webpackChunkName: "data-studio" */ "./app/pages/GitSyncSectionLayout"
  ).then(({ GitSyncSectionLayout }) => ({ Component: GitSyncSectionLayout }));

const dependenciesUpsellPage = () =>
  import(/* webpackChunkName: "data-studio-upsells" */ "./upsells/pages").then(
    ({ DependenciesUpsellPage }) => ({
      Component: DependenciesUpsellPage,
    }),
  );

const libraryUpsellPage = () =>
  import(/* webpackChunkName: "data-studio-upsells" */ "./upsells/pages").then(
    ({ LibraryUpsellPage }) => ({
      Component: LibraryUpsellPage,
    }),
  );

const schemaViewerUpsellPage = () =>
  import(/* webpackChunkName: "data-studio-upsells" */ "./upsells/pages").then(
    ({ SchemaViewerUpsellPage }) => ({
      Component: SchemaViewerUpsellPage,
    }),
  );

export function getDataStudioRoutes(IsAdmin: RouteComponent) {
  return (
    <>
      {/* These redirects sit
       * OUTSIDE the CanAccessDataStudio guard — users without Data Studio access must
       * still be forwarded —
       * and are declared BEFORE the guarded subtree so they win over its `path="*"`
       * catch-all
       */}

      {getDataStudioDependencyDiagnosticsRedirects()}
      <Route element={<CanAccessDataStudio />}>
        <Route path="data-studio" lazy={dataStudioLayout}>
          <Route index element={<DataStudioIndexRedirect />} />
          <Route path="guide" element={<GuidePage />} />
          <Route path="data" element={<CanAccessDataModel />}>
            <Route lazy={dataSectionLayout}>
              {getDataStudioMetadataRoutes(IsAdmin)}
            </Route>
          </Route>
          <Route path="transforms" lazy={transformsSectionLayout}>
            {getDataStudioTransformRoutes()}
          </Route>
          {getDataStudioGlossaryRoutes()}
          {getDataStudioSettingsRoutes()}
          {PLUGIN_LIBRARY.isEnabled ? (
            PLUGIN_LIBRARY.getDataStudioLibraryRoutes(IsAdmin)
          ) : (
            <Route path="library" lazy={libraryUpsellPage} />
          )}
          {PLUGIN_DEPENDENCIES.isEnabled ? (
            <Route path="dependencies" lazy={dependenciesSectionLayout}>
              {PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes()}
            </Route>
          ) : (
            <Route path="dependencies" lazy={dependenciesUpsellPage} />
          )}
          {PLUGIN_SCHEMA_VIEWER.isEnabled ? (
            <Route path="schema-viewer">
              {PLUGIN_SCHEMA_VIEWER.getDataStudioSchemaViewerRoutes()}
            </Route>
          ) : (
            <Route path="schema-viewer" lazy={schemaViewerUpsellPage} />
          )}
          <Route path="git-sync" lazy={gitSyncSectionLayout} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </>
  );
}

/**
 * Dependency Diagnostics moved from Data Studio to Monitor.  */
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

export function DataStudioIndexRedirect() {
  const indexPath = useSelector(getIndexPath);
  const { value: hasSeenGuide, isLoading } = useUserKeyValue({
    namespace: "data_studio",
    key: "hasSeenGuide",
    defaultValue: false,
  });

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Navigate to={hasSeenGuide ? indexPath : Urls.dataStudioGuide()} replace />
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
