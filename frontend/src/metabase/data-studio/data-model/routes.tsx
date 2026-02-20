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
import { IsAdminGuard, useRouteParams } from "metabase/routing/compat";

import { DataModel } from "./pages/DataModel";

type DataModelParams = {
  databaseId?: string;
  schemaId?: string;
  tableId?: string;
  tab?: string;
  fieldId?: string;
  segmentId?: string;
  measureId?: string;
};

const DataModelWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return <DataModel params={params} />;
};

const DataModelNewSegmentPageWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return (
    <DataModelNewSegmentPage
      params={{
        databaseId: params.databaseId ?? "",
        schemaId: params.schemaId ?? "",
        tableId: params.tableId ?? "",
      }}
    />
  );
};

const DataModelSegmentDetailPageWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return (
    <DataModelSegmentDetailPage
      params={{
        databaseId: params.databaseId ?? "",
        schemaId: params.schemaId ?? "",
        tableId: params.tableId ?? "",
        segmentId: params.segmentId ?? "",
      }}
    />
  );
};

const DataModelSegmentRevisionHistoryPageWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return (
    <DataModelSegmentRevisionHistoryPage
      params={{
        databaseId: params.databaseId ?? "",
        schemaId: params.schemaId ?? "",
        tableId: params.tableId ?? "",
        segmentId: params.segmentId ?? "",
      }}
    />
  );
};

const DataModelSegmentDependenciesPageWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return (
    <DataModelSegmentDependenciesPage
      params={{
        databaseId: params.databaseId ?? "",
        schemaId: params.schemaId ?? "",
        tableId: params.tableId ?? "",
        segmentId: params.segmentId ?? "",
      }}
    />
  );
};

const DataModelNewMeasurePageWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return (
    <DataModelNewMeasurePage
      params={{
        databaseId: params.databaseId ?? "",
        schemaId: params.schemaId ?? "",
        tableId: params.tableId ?? "",
      }}
    />
  );
};

const DataModelMeasureDetailPageWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return (
    <DataModelMeasureDetailPage
      params={{
        databaseId: params.databaseId ?? "",
        schemaId: params.schemaId ?? "",
        tableId: params.tableId ?? "",
        measureId: params.measureId ?? "",
      }}
    />
  );
};

const DataModelMeasureRevisionHistoryPageWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return (
    <DataModelMeasureRevisionHistoryPage
      params={{
        databaseId: params.databaseId ?? "",
        schemaId: params.schemaId ?? "",
        tableId: params.tableId ?? "",
        measureId: params.measureId ?? "",
      }}
    />
  );
};

const DataModelMeasureDependenciesPageWithRouteProps = () => {
  const params = useRouteParams<DataModelParams>();
  return (
    <DataModelMeasureDependenciesPage
      params={{
        databaseId: params.databaseId ?? "",
        schemaId: params.schemaId ?? "",
        tableId: params.tableId ?? "",
        measureId: params.measureId ?? "",
      }}
    />
  );
};

export function getDataStudioMetadataRoutes() {
  return null;
}

export function getDataStudioMetadataRouteObjects(): RouteObject[] {
  return [
    { index: true, element: <DataModelWithRouteProps /> },
    { path: "database", element: <DataModelWithRouteProps /> },
    { path: "database/:databaseId", element: <DataModelWithRouteProps /> },
    {
      path: "database/:databaseId/schema/:schemaId",
      element: <DataModelWithRouteProps />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId",
      element: <DataModelWithRouteProps />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/segments/new",
      element: (
        <IsAdminGuard>
          <DataModelNewSegmentPageWithRouteProps />
        </IsAdminGuard>
      ),
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId",
      element: <DataModelSegmentDetailPageWithRouteProps />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/revisions",
      element: <DataModelSegmentRevisionHistoryPageWithRouteProps />,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            path: "database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/dependencies",
            element: <DataModelSegmentDependenciesPageWithRouteProps />,
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
        <IsAdminGuard>
          <DataModelNewMeasurePageWithRouteProps />
        </IsAdminGuard>
      ),
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId",
      element: <DataModelMeasureDetailPageWithRouteProps />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/revisions",
      element: <DataModelMeasureRevisionHistoryPageWithRouteProps />,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            path: "database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/dependencies",
            element: <DataModelMeasureDependenciesPageWithRouteProps />,
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
      element: <DataModelWithRouteProps />,
    },
    {
      path: "database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId",
      element: <DataModelWithRouteProps />,
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
