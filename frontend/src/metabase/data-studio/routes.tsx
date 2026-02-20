import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_LIBRARY,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import {
  CanAccessDataStudioGuard,
  UserCanAccessDataModelGuard,
} from "metabase/routing/compat";
import { getDataStudioTransformRouteObjects } from "metabase/transforms/routes";
import { canAccessTransforms } from "metabase/transforms/selectors";

import { DataSectionLayout } from "./app/pages/DataSectionLayout";
import { DataStudioLayout } from "./app/pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./app/pages/DependenciesSectionLayout";
import { GitSyncSectionLayout } from "./app/pages/GitSyncSectionLayout";
import { DependencyDiagnosticsSectionLayout } from "./app/pages/TasksSectionLayout/TasksSectionLayout";
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { WorkspacesSectionLayout } from "./app/pages/WorkspacesSectionLayout";
import { getDataStudioMetadataRouteObjects } from "./data-model/routes";
import { getDataStudioGlossaryRouteObjects } from "./glossary/routes";
import {
  DependenciesUpsellPage,
  DependencyDiagnosticsUpsellPage,
  LibraryUpsellPage,
} from "./upsells/pages";

export function getDataStudioRoutes() {
  return null;
}

function DataStudioIndexRedirect() {
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransformsPage = useSelector(canAccessTransforms);

  const path = canAccessDataModel
    ? Urls.dataStudioData()
    : canAccessTransformsPage
      ? Urls.transformList()
      : Urls.dataStudioLibrary();

  return <Navigate to={path} replace />;
}

export function getDataStudioRouteObjects(): RouteObject[] {
  return [
    {
      element: <CanAccessDataStudioGuard />,
      children: [
        {
          path: "data-studio",
          element: <DataStudioLayout />,
          children: [
            { index: true, element: <DataStudioIndexRedirect /> },
            {
              path: "data",
              element: <UserCanAccessDataModelGuard />,
              children: [
                {
                  element: <DataSectionLayout />,
                  children: getDataStudioMetadataRouteObjects(),
                },
              ],
            },
            {
              path: "transforms",
              element: <TransformsSectionLayout />,
              children: getDataStudioTransformRouteObjects(),
            },
            ...getDataStudioGlossaryRouteObjects(),
            ...(PLUGIN_LIBRARY.isEnabled
              ? PLUGIN_LIBRARY.getDataStudioLibraryRouteObjects()
              : [{ path: "library", element: <LibraryUpsellPage /> }]),
            ...(PLUGIN_WORKSPACES.isEnabled
              ? [
                  {
                    path: "workspaces",
                    element: <WorkspacesSectionLayout />,
                    children:
                      PLUGIN_WORKSPACES.getDataStudioWorkspaceRouteObjects(),
                  } satisfies RouteObject,
                ]
              : []),
            ...(PLUGIN_DEPENDENCIES.isEnabled
              ? [
                  {
                    path: "dependencies",
                    element: <DependenciesSectionLayout />,
                    children:
                      PLUGIN_DEPENDENCIES.getDataStudioDependencyRouteObjects(),
                  } satisfies RouteObject,
                ]
              : [
                  { path: "dependencies", element: <DependenciesUpsellPage /> },
                ]),
            ...(PLUGIN_DEPENDENCIES.isEnabled
              ? [
                  {
                    path: "dependency-diagnostics",
                    element: <DependencyDiagnosticsSectionLayout />,
                    children:
                      PLUGIN_DEPENDENCIES.getDataStudioDependencyDiagnosticsRouteObjects(),
                  } satisfies RouteObject,
                ]
              : [
                  {
                    path: "dependency-diagnostics",
                    element: <DependencyDiagnosticsUpsellPage />,
                  },
                ]),
            { path: "git-sync", element: <GitSyncSectionLayout /> },
          ],
        },
      ],
    },
  ];
}
