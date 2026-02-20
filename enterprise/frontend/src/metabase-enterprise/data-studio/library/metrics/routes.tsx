import type { RouteObject } from "react-router-dom";

import { PLUGIN_CACHING, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { IndexRoute, Route } from "metabase/routing/compat/react-router-v3";

import { MetricDependenciesPage } from "./pages/MetricDependenciesPage";
import { MetricOverviewPage } from "./pages/MetricOverviewPage";
import { MetricQueryPage } from "./pages/MetricQueryPage";
import { NewMetricPage } from "./pages/NewMetricPage";

export function getDataStudioMetricRoutes() {
  return (
    <Route path="metrics">
      <Route path="new" component={NewMetricPage} />
      <Route path=":cardId" component={MetricOverviewPage} />
      <Route path=":cardId/query" component={MetricQueryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":cardId/dependencies" component={MetricDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      {PLUGIN_CACHING.isGranularCachingEnabled() && (
        <Route
          path=":cardId/caching"
          component={PLUGIN_CACHING.MetricCachingPage}
        />
      )}
    </Route>
  );
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
