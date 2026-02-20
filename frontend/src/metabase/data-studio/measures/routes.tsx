import type { ComponentType } from "react";
import type { RouteObject } from "react-router-dom";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { MeasureDependenciesPage } from "./pages/MeasureDependenciesPage";
import { MeasureDetailPage } from "./pages/MeasureDetailPage";
import { MeasureRevisionHistoryPage } from "./pages/MeasureRevisionHistoryPage";
import { NewMeasurePage } from "./pages/NewMeasurePage";

const NewMeasurePageRoute = NewMeasurePage as unknown as ComponentType;
const MeasureDetailPageRoute = MeasureDetailPage as unknown as ComponentType;
const MeasureRevisionHistoryPageRoute =
  MeasureRevisionHistoryPage as unknown as ComponentType;
const MeasureDependenciesPageRoute =
  MeasureDependenciesPage as unknown as ComponentType;

export function getDataStudioMeasureRoutes() {
  return null;
}

export function getDataStudioMeasureRouteObjects(): RouteObject[] {
  return [
    {
      path: "measures",
      children: [
        { path: "new", element: <NewMeasurePageRoute /> },
        { path: ":measureId", element: <MeasureDetailPageRoute /> },
        {
          path: ":measureId/history",
          element: <MeasureRevisionHistoryPageRoute />,
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":measureId/dependencies",
                element: <MeasureDependenciesPageRoute />,
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
