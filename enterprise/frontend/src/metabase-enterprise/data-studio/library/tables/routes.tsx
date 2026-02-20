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
import { IsAdminGuard, useCompatParams } from "metabase/routing/compat";

import { TableDependenciesPage } from "./pages/TableDependenciesPage";
import { TableFieldsPage } from "./pages/TableFieldsPage";
import { TableMeasuresPage } from "./pages/TableMeasuresPage";
import { TableOverviewPage } from "./pages/TableOverviewPage";
import { TableSegmentsPage } from "./pages/TableSegmentsPage";

type TableRouteParams = {
  tableId?: string;
  fieldId?: string;
  segmentId?: string;
  measureId?: string;
};

const TableOverviewPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return <TableOverviewPage params={{ tableId: params.tableId ?? "" }} />;
};

const TableFieldsPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <TableFieldsPage
      params={{ tableId: params.tableId ?? "", fieldId: params.fieldId }}
    />
  );
};

const TableSegmentsPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return <TableSegmentsPage params={{ tableId: params.tableId ?? "" }} />;
};

const PublishedTableNewSegmentPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <PublishedTableNewSegmentPage params={{ tableId: params.tableId ?? "" }} />
  );
};

const PublishedTableSegmentDetailPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <PublishedTableSegmentDetailPage
      params={{
        tableId: params.tableId ?? "",
        segmentId: params.segmentId ?? "",
      }}
    />
  );
};

const PublishedTableSegmentRevisionHistoryPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <PublishedTableSegmentRevisionHistoryPage
      params={{
        tableId: params.tableId ?? "",
        segmentId: params.segmentId ?? "",
      }}
    />
  );
};

const PublishedTableSegmentDependenciesPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <PublishedTableSegmentDependenciesPage
      params={{
        tableId: params.tableId ?? "",
        segmentId: params.segmentId ?? "",
      }}
    />
  );
};

const TableMeasuresPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return <TableMeasuresPage params={{ tableId: params.tableId ?? "" }} />;
};

const PublishedTableNewMeasurePageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <PublishedTableNewMeasurePage params={{ tableId: params.tableId ?? "" }} />
  );
};

const PublishedTableMeasureDetailPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <PublishedTableMeasureDetailPage
      params={{
        tableId: params.tableId ?? "",
        measureId: params.measureId ?? "",
      }}
    />
  );
};

const PublishedTableMeasureRevisionHistoryPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <PublishedTableMeasureRevisionHistoryPage
      params={{
        tableId: params.tableId ?? "",
        measureId: params.measureId ?? "",
      }}
    />
  );
};

const PublishedTableMeasureDependenciesPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return (
    <PublishedTableMeasureDependenciesPage
      params={{
        tableId: params.tableId ?? "",
        measureId: params.measureId ?? "",
      }}
    />
  );
};

const TableDependenciesPageWithRouteProps = () => {
  const params = useCompatParams<TableRouteParams>();
  return <TableDependenciesPage params={{ tableId: params.tableId ?? "" }} />;
};

export function getDataStudioTableRoutes() {
  return null;
}

export function getDataStudioTableRouteObjects(): RouteObject[] {
  return [
    {
      path: "tables",
      children: [
        { path: ":tableId", element: <TableOverviewPageWithRouteProps /> },
        { path: ":tableId/fields", element: <TableFieldsPageWithRouteProps /> },
        {
          path: ":tableId/fields/:fieldId",
          element: <TableFieldsPageWithRouteProps />,
        },
        {
          path: ":tableId/segments",
          element: <TableSegmentsPageWithRouteProps />,
        },
        {
          path: ":tableId/segments/new",
          element: (
            <IsAdminGuard>
              <PublishedTableNewSegmentPageWithRouteProps />
            </IsAdminGuard>
          ),
        },
        {
          path: ":tableId/segments/:segmentId",
          element: <PublishedTableSegmentDetailPageWithRouteProps />,
        },
        {
          path: ":tableId/segments/:segmentId/revisions",
          element: <PublishedTableSegmentRevisionHistoryPageWithRouteProps />,
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":tableId/segments/:segmentId/dependencies",
                element: (
                  <PublishedTableSegmentDependenciesPageWithRouteProps />
                ),
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
          path: ":tableId/measures",
          element: <TableMeasuresPageWithRouteProps />,
        },
        {
          path: ":tableId/measures/new",
          element: (
            <IsAdminGuard>
              <PublishedTableNewMeasurePageWithRouteProps />
            </IsAdminGuard>
          ),
        },
        {
          path: ":tableId/measures/:measureId",
          element: <PublishedTableMeasureDetailPageWithRouteProps />,
        },
        {
          path: ":tableId/measures/:measureId/revisions",
          element: <PublishedTableMeasureRevisionHistoryPageWithRouteProps />,
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                path: ":tableId/measures/:measureId/dependencies",
                element: (
                  <PublishedTableMeasureDependenciesPageWithRouteProps />
                ),
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
                element: <TableDependenciesPageWithRouteProps />,
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
