import type { RouteObject } from "react-router-dom";

import { PublishedTableMeasureDependenciesPage } from "metabase/data-studio/measures/pages/PublishedTableMeasureDependenciesPage";
import { PublishedTableMeasureDetailPage } from "metabase/data-studio/measures/pages/PublishedTableMeasureDetailPage";
import { PublishedTableMeasureRevisionHistoryPage } from "metabase/data-studio/measures/pages/PublishedTableMeasureRevisionHistoryPage";
import { PublishedTableNewMeasurePage } from "metabase/data-studio/measures/pages/PublishedTableNewMeasurePage";
import { PublishedTableNewSegmentPage } from "metabase/data-studio/segments/pages/PublishedTableNewSegmentPage";
import { PublishedTableSegmentDependenciesPage } from "metabase/data-studio/segments/pages/PublishedTableSegmentDependenciesPage";
import { PublishedTableSegmentDetailPage } from "metabase/data-studio/segments/pages/PublishedTableSegmentDetailPage";
import { PublishedTableSegmentRevisionHistoryPage } from "metabase/data-studio/segments/pages/PublishedTableSegmentRevisionHistoryPage";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { IsAdmin } from "metabase/route-guards";

import { TableDependenciesPage } from "./pages/TableDependenciesPage";
import { TableFieldsPage } from "./pages/TableFieldsPage";
import { TableMeasuresPage } from "./pages/TableMeasuresPage";
import { TableOverviewPage } from "./pages/TableOverviewPage";
import { TableSegmentsPage } from "./pages/TableSegmentsPage";

export function getDataStudioTableRoutes() {
  return null;
}

export function getDataStudioTableRouteObjects(): RouteObject[] {
  return [
    {
      path: "tables",
      children: [
        { path: ":tableId", element: <TableOverviewPage /> },
        { path: ":tableId/fields", element: <TableFieldsPage /> },
        { path: ":tableId/fields/:fieldId", element: <TableFieldsPage /> },
        { path: ":tableId/segments", element: <TableSegmentsPage /> },
        {
          path: ":tableId/segments/new",
          element: (
            <IsAdmin>
              <PublishedTableNewSegmentPage />
            </IsAdmin>
          ),
        },
        {
          path: ":tableId/segments/:segmentId",
          element: <PublishedTableSegmentDetailPage />,
        },
        {
          path: ":tableId/segments/:segmentId/revisions",
          element: <PublishedTableSegmentRevisionHistoryPage />,
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":tableId/segments/:segmentId/dependencies",
                element: <PublishedTableSegmentDependenciesPage />,
                children: [
                  {
                    index: true,
                    element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
                  },
                ],
              } satisfies RouteObject,
            ]
          : []),
        { path: ":tableId/measures", element: <TableMeasuresPage /> },
        {
          path: ":tableId/measures/new",
          element: (
            <IsAdmin>
              <PublishedTableNewMeasurePage />
            </IsAdmin>
          ),
        },
        {
          path: ":tableId/measures/:measureId",
          element: <PublishedTableMeasureDetailPage />,
        },
        {
          path: ":tableId/measures/:measureId/revisions",
          element: <PublishedTableMeasureRevisionHistoryPage />,
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":tableId/measures/:measureId/dependencies",
                element: <PublishedTableMeasureDependenciesPage />,
                children: [
                  {
                    index: true,
                    element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
                  },
                ],
              } satisfies RouteObject,
            ]
          : []),
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":tableId/dependencies",
                element: <TableDependenciesPage />,
                children: [
                  {
                    index: true,
                    element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
                  },
                ],
              } satisfies RouteObject,
            ]
          : []),
      ],
    },
  ];
}
