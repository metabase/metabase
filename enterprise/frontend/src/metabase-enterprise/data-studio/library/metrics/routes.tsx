import type { RouteObject } from "react-router-dom";

import { PLUGIN_CACHING, PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { MetricDependenciesPage } from "./pages/MetricDependenciesPage";
import { MetricOverviewPage } from "./pages/MetricOverviewPage";
import { MetricQueryPage } from "./pages/MetricQueryPage";
import { NewMetricPage } from "./pages/NewMetricPage";

export function getDataStudioMetricRoutes() {
  return null;
}

export function getDataStudioMetricRouteObjects(): RouteObject[] {
  return [
    {
      path: "metrics",
      children: [
        { path: "new", element: <NewMetricPage /> },
        { path: ":cardId", element: <MetricOverviewPage /> },
        { path: ":cardId/query", element: <MetricQueryPage /> },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":cardId/dependencies",
                element: <MetricDependenciesPage />,
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
                element: <PLUGIN_CACHING.MetricCachingPage />,
              } satisfies RouteObject,
            ]
          : []),
      ],
    },
  ];
}
