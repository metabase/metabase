import type { ComponentType } from "react";
import type { RouteObject } from "react-router-dom";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { NewSegmentPage } from "./pages/NewSegmentPage";
import { SegmentDependenciesPage } from "./pages/SegmentDependenciesPage";
import { SegmentDetailPage } from "./pages/SegmentDetailPage";
import { SegmentRevisionHistoryPage } from "./pages/SegmentRevisionHistoryPage";

const NewSegmentPageRoute = NewSegmentPage as unknown as ComponentType;
const SegmentDetailPageRoute = SegmentDetailPage as unknown as ComponentType;
const SegmentRevisionHistoryPageRoute =
  SegmentRevisionHistoryPage as unknown as ComponentType;
const SegmentDependenciesPageRoute =
  SegmentDependenciesPage as unknown as ComponentType;

export function getDataStudioSegmentRoutes() {
  return null;
}

export function getDataStudioSegmentRouteObjects(): RouteObject[] {
  return [
    {
      path: "segments",
      children: [
        { path: "new", element: <NewSegmentPageRoute /> },
        { path: ":segmentId", element: <SegmentDetailPageRoute /> },
        {
          path: ":segmentId/history",
          element: <SegmentRevisionHistoryPageRoute />,
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":segmentId/dependencies",
                element: <SegmentDependenciesPageRoute />,
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
