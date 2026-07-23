import type { ComponentType } from "react";

import { PublishedTableMeasureDependenciesPage } from "metabase/data-studio/measures/pages/PublishedTableMeasureDependenciesPage";
import { PublishedTableMeasureDetailPage } from "metabase/data-studio/measures/pages/PublishedTableMeasureDetailPage";
import { PublishedTableMeasureRevisionHistoryPage } from "metabase/data-studio/measures/pages/PublishedTableMeasureRevisionHistoryPage";
import { PublishedTableNewMeasurePage } from "metabase/data-studio/measures/pages/PublishedTableNewMeasurePage";
import { PublishedTableNewSegmentPage } from "metabase/data-studio/segments/pages/PublishedTableNewSegmentPage";
import { PublishedTableSegmentDependenciesPage } from "metabase/data-studio/segments/pages/PublishedTableSegmentDependenciesPage";
import { PublishedTableSegmentDetailPage } from "metabase/data-studio/segments/pages/PublishedTableSegmentDetailPage";
import { PublishedTableSegmentRevisionHistoryPage } from "metabase/data-studio/segments/pages/PublishedTableSegmentRevisionHistoryPage";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route, withRouteProps } from "metabase/router";

import { TableDependenciesPage } from "./pages/TableDependenciesPage";
import { TableFieldsPage } from "./pages/TableFieldsPage";
import { TableMeasuresPage } from "./pages/TableMeasuresPage";
import { TableOverviewPage } from "./pages/TableOverviewPage";
import { TableSegmentsPage } from "./pages/TableSegmentsPage";

const RoutedTableOverviewPage = withRouteProps(TableOverviewPage);
const RoutedTableFieldsPage = withRouteProps(TableFieldsPage);
const RoutedTableSegmentsPage = withRouteProps(TableSegmentsPage);
const RoutedTableMeasuresPage = withRouteProps(TableMeasuresPage);
const RoutedTableDependenciesPage = withRouteProps(TableDependenciesPage);
const RoutedPublishedTableNewSegmentPage = withRouteProps(
  PublishedTableNewSegmentPage,
);
const RoutedPublishedTableSegmentDetailPage = withRouteProps(
  PublishedTableSegmentDetailPage,
);
const RoutedPublishedTableSegmentRevisionHistoryPage = withRouteProps(
  PublishedTableSegmentRevisionHistoryPage,
);
const RoutedPublishedTableSegmentDependenciesPage = withRouteProps(
  PublishedTableSegmentDependenciesPage,
);
const RoutedPublishedTableNewMeasurePage = withRouteProps(
  PublishedTableNewMeasurePage,
);
const RoutedPublishedTableMeasureDetailPage = withRouteProps(
  PublishedTableMeasureDetailPage,
);
const RoutedPublishedTableMeasureRevisionHistoryPage = withRouteProps(
  PublishedTableMeasureRevisionHistoryPage,
);
const RoutedPublishedTableMeasureDependenciesPage = withRouteProps(
  PublishedTableMeasureDependenciesPage,
);

export function getDataStudioTableRoutes(IsAdmin: ComponentType) {
  return (
    <Route path="tables">
      <Route path=":tableId" element={<RoutedTableOverviewPage />} />
      <Route path=":tableId/fields" element={<RoutedTableFieldsPage />} />
      <Route
        path=":tableId/fields/:fieldId"
        element={<RoutedTableFieldsPage />}
      />
      <Route path=":tableId/segments" element={<RoutedTableSegmentsPage />} />
      <Route path=":tableId/segments/new" element={<IsAdmin />}>
        <Route index element={<RoutedPublishedTableNewSegmentPage />} />
      </Route>
      <Route
        path=":tableId/segments/:segmentId"
        element={<RoutedPublishedTableSegmentDetailPage />}
      />
      <Route
        path=":tableId/segments/:segmentId/revisions"
        element={<RoutedPublishedTableSegmentRevisionHistoryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":tableId/segments/:segmentId/dependencies"
          element={<RoutedPublishedTableSegmentDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":tableId/measures" element={<RoutedTableMeasuresPage />} />
      <Route path=":tableId/measures/new" element={<IsAdmin />}>
        <Route index element={<RoutedPublishedTableNewMeasurePage />} />
      </Route>
      <Route
        path=":tableId/measures/:measureId"
        element={<RoutedPublishedTableMeasureDetailPage />}
      />
      <Route
        path=":tableId/measures/:measureId/revisions"
        element={<RoutedPublishedTableMeasureRevisionHistoryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":tableId/measures/:measureId/dependencies"
          element={<RoutedPublishedTableMeasureDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":tableId/dependencies"
          element={<RoutedTableDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
    </Route>
  );
}
