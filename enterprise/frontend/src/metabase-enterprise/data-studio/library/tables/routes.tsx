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
import { Route } from "metabase/router";

import { TableDependenciesPage } from "./pages/TableDependenciesPage";
import { TableFieldsPage } from "./pages/TableFieldsPage";
import { TableMeasuresPage } from "./pages/TableMeasuresPage";
import { TableOverviewPage } from "./pages/TableOverviewPage";
import { TableSegmentsPage } from "./pages/TableSegmentsPage";

export function getDataStudioTableRoutes(IsAdmin: ComponentType) {
  return (
    <Route path="tables">
      <Route path=":tableId" element={<TableOverviewPage />} />
      <Route path=":tableId/fields" element={<TableFieldsPage />} />
      <Route path=":tableId/fields/:fieldId" element={<TableFieldsPage />} />
      <Route path=":tableId/segments" element={<TableSegmentsPage />} />
      <Route path=":tableId/segments/new" element={<IsAdmin />}>
        <Route index element={<PublishedTableNewSegmentPage />} />
      </Route>
      <Route
        path=":tableId/segments/:segmentId"
        element={<PublishedTableSegmentDetailPage />}
      />
      <Route
        path=":tableId/segments/:segmentId/revisions"
        element={<PublishedTableSegmentRevisionHistoryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":tableId/segments/:segmentId/dependencies"
          element={<PublishedTableSegmentDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":tableId/measures" element={<TableMeasuresPage />} />
      <Route path=":tableId/measures/new" element={<IsAdmin />}>
        <Route index element={<PublishedTableNewMeasurePage />} />
      </Route>
      <Route
        path=":tableId/measures/:measureId"
        element={<PublishedTableMeasureDetailPage />}
      />
      <Route
        path=":tableId/measures/:measureId/revisions"
        element={<PublishedTableMeasureRevisionHistoryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":tableId/measures/:measureId/dependencies"
          element={<PublishedTableMeasureDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":tableId/dependencies" element={<TableDependenciesPage />}>
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
    </Route>
  );
}
