import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
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
import { IndexRoute, Route } from "metabase/routing/compat/react-router-v3";
import {
  getDataStudioTransformRouteObjects,
  getDataStudioTransformRoutes,
} from "metabase/transforms/routes";
import { canAccessTransforms } from "metabase/transforms/selectors";
import type { State } from "metabase-types/store";

import { DataSectionLayout } from "./app/pages/DataSectionLayout";
import { DataStudioLayout } from "./app/pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./app/pages/DependenciesSectionLayout";
import { GitSyncSectionLayout } from "./app/pages/GitSyncSectionLayout";
import { DependencyDiagnosticsSectionLayout } from "./app/pages/TasksSectionLayout/TasksSectionLayout";
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { WorkspacesSectionLayout } from "./app/pages/WorkspacesSectionLayout";
import {
  getDataStudioMetadataRouteObjects,
  getDataStudioMetadataRoutes,
} from "./data-model/routes";
import {
  getDataStudioGlossaryRouteObjects,
  getDataStudioGlossaryRoutes,
} from "./glossary/routes";
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
      </Route>
    </Route>
  );
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

function getIndexPath(state: State) {
  if (PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state)) {
    return Urls.dataStudioData();
  }
  if (canAccessTransforms(state)) {
    return Urls.transformList();
  }
  return Urls.dataStudioLibrary();
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
