import { Navigate, type RouteObject } from "react-router-dom";

import { DataModelMeasureDependenciesPage } from "metabase/data-studio/measures/pages/DataModelMeasureDependenciesPage";
import { DataModelMeasureDetailPage } from "metabase/data-studio/measures/pages/DataModelMeasureDetailPage";
import { DataModelMeasureRevisionHistoryPage } from "metabase/data-studio/measures/pages/DataModelMeasureRevisionHistoryPage";
import { DataModelNewMeasurePage } from "metabase/data-studio/measures/pages/DataModelNewMeasurePage";
import { DataModelNewSegmentPage } from "metabase/data-studio/segments/pages/DataModelNewSegmentPage";
import { DataModelSegmentDependenciesPage } from "metabase/data-studio/segments/pages/DataModelSegmentDependenciesPage";
import { DataModelSegmentDetailPage } from "metabase/data-studio/segments/pages/DataModelSegmentDetailPage";
import { DataModelSegmentRevisionHistoryPage } from "metabase/data-studio/segments/pages/DataModelSegmentRevisionHistoryPage";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { IsAdmin } from "metabase/route-guards";

import { DataModel } from "./pages/DataModel";

export function getDataStudioMetadataRoutes() {
  return null;
}

export function getDataStudioMetadataRouteObjects(): RouteObject[] {
  return [
    { index: true, element: <DataModel /> },
    { path: "database", element: <DataModel /> },
    { path: "database/:databaseId", element: <DataModel /> },
    {
      path: "database/:databaseId/schema/:schemaId",
      element: <DataModel />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId",
      element: <DataModel />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/segments/new",
      element: (
        <IsAdmin>
          <DataModelNewSegmentPage />
        </IsAdmin>
      ),
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId",
      element: <DataModelSegmentDetailPage />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/revisions",
      element: <DataModelSegmentRevisionHistoryPage />,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            path: "database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/dependencies",
            element: <DataModelSegmentDependenciesPage />,
            children: [
              {
                index: true,
                element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
              },
            ],
          } satisfies RouteObject,
        ]
      : []),
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/measures/new",
      element: (
        <IsAdmin>
          <DataModelNewMeasurePage />
        </IsAdmin>
      ),
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId",
      element: <DataModelMeasureDetailPage />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/revisions",
      element: <DataModelMeasureRevisionHistoryPage />,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            path: "database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/dependencies",
            element: <DataModelMeasureDependenciesPage />,
            children: [
              {
                index: true,
                element: <PLUGIN_DEPENDENCIES.DependencyGraphPage />,
              },
            ],
          } satisfies RouteObject,
        ]
      : []),
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/:tab",
      element: <DataModel />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId",
      element: <DataModel />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/settings",
      element: <Navigate to="../field" replace relative="path" />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section",
      element: <Navigate to=".." replace relative="path" />,
    },
  ];
}
