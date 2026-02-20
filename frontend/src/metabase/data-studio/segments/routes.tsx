import type { RouteObject } from "react-router-dom";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { IndexRoute, Route } from "metabase/routing/compat/react-router-v3";

import { NewSegmentPage } from "./pages/NewSegmentPage";
import { SegmentDependenciesPage } from "./pages/SegmentDependenciesPage";
import { SegmentDetailPage } from "./pages/SegmentDetailPage";
import { SegmentRevisionHistoryPage } from "./pages/SegmentRevisionHistoryPage";

export function getDataStudioSegmentRoutes() {
  return (
    <Route path="segments">
      <Route path="new" component={NewSegmentPage} />
      <Route path=":segmentId" component={SegmentDetailPage} />
      <Route path=":segmentId/history" component={SegmentRevisionHistoryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":segmentId/dependencies"
          component={SegmentDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}

export function getDataStudioSegmentRouteObjects(): RouteObject[] {
  return [
    {
      path: "segments",
      children: [
        { path: "new", element: <NewSegmentPage /> },
        { path: ":segmentId", element: <SegmentDetailPage /> },
        { path: ":segmentId/history", element: <SegmentRevisionHistoryPage /> },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":segmentId/dependencies",
                element: <SegmentDependenciesPage />,
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
