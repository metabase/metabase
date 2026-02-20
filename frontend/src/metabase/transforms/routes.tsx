import { Outlet, type RouteObject } from "react-router-dom";

import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { useCompatLocation, useCompatParams } from "metabase/routing/compat";

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

const RunListPageWithRouteProps = () => {
  const location = useCompatLocation();
  return <RunListPage location={location} />;
};

const JobPageWithRouteProps = () => {
  const params = useCompatParams<{ jobId?: string }>();
  return <JobPage params={{ jobId: params.jobId ?? "" }} />;
};

const NewCardTransformPageWithRouteProps = () => {
  const params = useCompatParams<{ cardId?: string }>();
  return <NewCardTransformPage params={{ cardId: params.cardId ?? "" }} />;
};

const TransformQueryPageWithRouteProps = () => {
  const params = useCompatParams<{ transformId?: string }>();
  return (
    <TransformQueryPage params={{ transformId: params.transformId ?? "" }} />
  );
};

const TransformRunPageWithRouteProps = () => {
  const params = useCompatParams<{ transformId?: string }>();
  return (
    <TransformRunPage params={{ transformId: params.transformId ?? "" }} />
  );
};

const TransformSettingsPageWithRouteProps = () => {
  const params = useCompatParams<{ transformId?: string }>();
  return (
    <TransformSettingsPage params={{ transformId: params.transformId ?? "" }} />
  );
};

export function getDataStudioTransformRoutes() {
  return null;
}

export function getDataStudioTransformRouteObjects(): RouteObject[] {
  return [
    {
      path: "runs",
      element: (
        <TransformTopNavLayout>
          <Outlet />
        </TransformTopNavLayout>
      ),
      children: [{ index: true, element: <RunListPageWithRouteProps /> }],
    },
    {
      index: true,
      element: <TransformListPage />,
    },
    { path: "jobs", element: <JobListPage /> },
    { path: "jobs/new", element: <NewJobPage /> },
    { path: "jobs/:jobId", element: <JobPageWithRouteProps /> },
    { path: "new/query", element: <NewQueryTransformPage /> },
    { path: "new/native", element: <NewNativeTransformPage /> },
    {
      path: "new/card/:cardId",
      element: <NewCardTransformPageWithRouteProps />,
    },
    ...(PLUGIN_TRANSFORMS_PYTHON.isEnabled
      ? [{ path: "new/python", element: <NewPythonTransformPage /> }]
      : []),
    { path: ":transformId", element: <TransformQueryPageWithRouteProps /> },
    {
      path: ":transformId/edit",
      element: <TransformQueryPageWithRouteProps />,
    },
    { path: ":transformId/run", element: <TransformRunPageWithRouteProps /> },
    {
      path: ":transformId/settings",
      element: <TransformSettingsPageWithRouteProps />,
    },
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
