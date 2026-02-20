import type { RouteObject } from "react-router-dom";

import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { IndexRoute, Route } from "metabase/routing/compat/react-router-v3";

import { JobListPage } from "./pages/JobListPage";
import { JobPage } from "./pages/JobPage";
import { NewJobPage } from "./pages/NewJobPage";
import {
  NewCardTransformPage,
  NewNativeTransformPage,
  NewPythonTransformPage,
  NewQueryTransformPage,
} from "./pages/NewTransformPage";
import { RunListPage } from "./pages/RunListPage";
import { TransformDependenciesPage } from "./pages/TransformDependenciesPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";
import { TransformRunPage } from "./pages/TransformRunPage";
import { TransformSettingsPage } from "./pages/TransformSettingsPage";
import { TransformTopNavLayout } from "./pages/TransformTopNavLayout";

export function getDataStudioTransformRoutes() {
  return (
    <>
      <Route path="runs" component={TransformTopNavLayout}>
        <IndexRoute component={RunListPage} />
      </Route>
      <Route>
        <IndexRoute component={TransformListPage} />
        <Route path="jobs" component={JobListPage} />
        <Route path="jobs/new" component={NewJobPage} />
        <Route path="jobs/:jobId" component={JobPage} />
        <Route path="new/query" component={NewQueryTransformPage} />
        <Route path="new/native" component={NewNativeTransformPage} />
        <Route path="new/card/:cardId" component={NewCardTransformPage} />
        {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
          <Route path="new/python" component={NewPythonTransformPage} />
        )}
        <Route path=":transformId" component={TransformQueryPage} />
        <Route path=":transformId/edit" component={TransformQueryPage} />
        <Route path=":transformId/run" component={TransformRunPage} />
        <Route path=":transformId/settings" component={TransformSettingsPage} />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route
            path=":transformId/dependencies"
            component={TransformDependenciesPage}
          >
            <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
          </Route>
        )}
        {PLUGIN_TRANSFORMS_PYTHON.getPythonLibraryRoutes()}
      </Route>
    </>
  );
}

export function getDataStudioTransformRouteObjects(): RouteObject[] {
  return [
    {
      path: "runs",
      element: <TransformTopNavLayout />,
      children: [{ index: true, element: <RunListPage /> }],
    },
    {
      index: true,
      element: <TransformListPage />,
    },
    { path: "jobs", element: <JobListPage /> },
    { path: "jobs/new", element: <NewJobPage /> },
    { path: "jobs/:jobId", element: <JobPage /> },
    { path: "new/query", element: <NewQueryTransformPage /> },
    { path: "new/native", element: <NewNativeTransformPage /> },
    { path: "new/card/:cardId", element: <NewCardTransformPage /> },
    ...(PLUGIN_TRANSFORMS_PYTHON.isEnabled
      ? [{ path: "new/python", element: <NewPythonTransformPage /> }]
      : []),
    { path: ":transformId", element: <TransformQueryPage /> },
    { path: ":transformId/edit", element: <TransformQueryPage /> },
    { path: ":transformId/run", element: <TransformRunPage /> },
    { path: ":transformId/settings", element: <TransformSettingsPage /> },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            path: ":transformId/dependencies",
            element: <TransformDependenciesPage />,
            children: [
              {
                index: true,
                element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
              },
            ],
          } satisfies RouteObject,
        ]
      : []),
  ];
}
