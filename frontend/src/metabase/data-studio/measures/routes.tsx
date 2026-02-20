import type { RouteObject } from "react-router-dom";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { IndexRoute, Route } from "metabase/routing/compat/react-router-v3";

import { MeasureDependenciesPage } from "./pages/MeasureDependenciesPage";
import { MeasureDetailPage } from "./pages/MeasureDetailPage";
import { MeasureRevisionHistoryPage } from "./pages/MeasureRevisionHistoryPage";
import { NewMeasurePage } from "./pages/NewMeasurePage";

export function getDataStudioMeasureRoutes() {
  return (
    <Route path="measures">
      <Route path="new" component={NewMeasurePage} />
      <Route path=":measureId" component={MeasureDetailPage} />
      <Route path=":measureId/history" component={MeasureRevisionHistoryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":measureId/dependencies"
          component={MeasureDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}

export function getDataStudioMeasureRouteObjects(): RouteObject[] {
  return [
    {
      path: "measures",
      children: [
        { path: "new", element: <NewMeasurePage /> },
        { path: ":measureId", element: <MeasureDetailPage /> },
        { path: ":measureId/history", element: <MeasureRevisionHistoryPage /> },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":measureId/dependencies",
                element: <MeasureDependenciesPage />,
                children: [
                  {
                    index: true,
                    element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
                  },
                ],
              },
            ]
          : []),
      ],
    },
  ];
}
