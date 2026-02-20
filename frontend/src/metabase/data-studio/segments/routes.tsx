import type { RouteObject } from "react-router-dom";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { NewSegmentPage } from "./pages/NewSegmentPage";
import { SegmentDependenciesPage } from "./pages/SegmentDependenciesPage";
import { SegmentDetailPage } from "./pages/SegmentDetailPage";
import { SegmentRevisionHistoryPage } from "./pages/SegmentRevisionHistoryPage";

export function getDataStudioSegmentRoutes() {
  return null;
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
