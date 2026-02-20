import type { RouteObject } from "react-router-dom";

import { PLUGIN_CACHING, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useLocationWithQuery, useRouteParams } from "metabase/routing/compat";

import { MetricDependenciesPage } from "./pages/MetricDependenciesPage";
import { MetricOverviewPage } from "./pages/MetricOverviewPage";
import { MetricQueryPage } from "./pages/MetricQueryPage";
import { NewMetricPage } from "./pages/NewMetricPage";

const NewMetricPageWithRouteProps = () => {
  const location = useLocationWithQuery();
  return <NewMetricPage location={location} />;
};

const MetricOverviewPageWithRouteProps = () => {
  const params = useRouteParams<{ cardId?: string }>();
  return <MetricOverviewPage params={{ cardId: params.cardId ?? "" }} />;
};

const MetricQueryPageWithRouteProps = () => {
  const params = useRouteParams<{ cardId?: string }>();
  return <MetricQueryPage params={{ cardId: params.cardId ?? "" }} />;
};

const MetricDependenciesPageWithRouteProps = () => {
  const params = useRouteParams<{ cardId?: string }>();
  return <MetricDependenciesPage params={{ cardId: params.cardId ?? "" }} />;
};

const MetricCachingPageWithRouteProps = () => {
  const params = useRouteParams<{ cardId?: string }>();
  return (
    <PLUGIN_CACHING.MetricCachingPage
      params={{ cardId: params.cardId ?? "" }}
    />
  );
};

export function getDataStudioMetricRoutes() {
  return null;
}

export function getDataStudioMetricRouteObjects(): RouteObject[] {
  return [
    {
      path: "metrics",
      children: [
        { path: "new", element: <NewMetricPageWithRouteProps /> },
        { path: ":cardId", element: <MetricOverviewPageWithRouteProps /> },
        { path: ":cardId/query", element: <MetricQueryPageWithRouteProps /> },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":cardId/dependencies",
                element: <MetricDependenciesPageWithRouteProps />,
                children: [
                  {
                    index: true,
                    element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
                  },
                ],
              } satisfies RouteObject,
            ]
          : []),
        ...(PLUGIN_CACHING.isGranularCachingEnabled()
          ? [
              {
                path: ":cardId/caching",
                element: <MetricCachingPageWithRouteProps />,
              } satisfies RouteObject,
            ]
          : []),
      ],
    },
  ];
}
