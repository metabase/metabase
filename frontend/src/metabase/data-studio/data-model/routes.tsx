import type { ComponentType } from "react";

import { DataModelMeasureDependenciesPage } from "metabase/data-studio/measures/pages/DataModelMeasureDependenciesPage";
import { DataModelMeasureDetailPage } from "metabase/data-studio/measures/pages/DataModelMeasureDetailPage";
import { DataModelMeasureRevisionHistoryPage } from "metabase/data-studio/measures/pages/DataModelMeasureRevisionHistoryPage";
import { DataModelNewMeasurePage } from "metabase/data-studio/measures/pages/DataModelNewMeasurePage";
import { DataModelNewSegmentPage } from "metabase/data-studio/segments/pages/DataModelNewSegmentPage";
import { DataModelSegmentDependenciesPage } from "metabase/data-studio/segments/pages/DataModelSegmentDependenciesPage";
import { DataModelSegmentDetailPage } from "metabase/data-studio/segments/pages/DataModelSegmentDetailPage";
import { DataModelSegmentRevisionHistoryPage } from "metabase/data-studio/segments/pages/DataModelSegmentRevisionHistoryPage";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route, redirect } from "metabase/router";

import { DataModel } from "./pages/DataModel";

export function getDataStudioMetadataRoutes(IsAdmin: ComponentType) {
  return (
    <>
      <Route index element={<DataModel />} />
      <Route path="database" element={<DataModel />} />
      <Route path="database/:databaseId" element={<DataModel />} />
      <Route
        path="database/:databaseId/schema/:schemaId"
        element={<DataModel />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        element={<DataModel />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/new"
        element={<IsAdmin />}
      >
        <Route index element={<DataModelNewSegmentPage />} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId"
        element={<DataModelSegmentDetailPage />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/revisions"
        element={<DataModelSegmentRevisionHistoryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/dependencies"
          element={<DataModelSegmentDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/new"
        element={<IsAdmin />}
      >
        <Route index element={<DataModelNewMeasurePage />} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId"
        element={<DataModelMeasureDetailPage />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/revisions"
        element={<DataModelMeasureRevisionHistoryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/dependencies"
          element={<DataModelMeasureDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        element={redirect(
          "database/:databaseId/schema/:schemaId/table/:tableId/details",
        )}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab"
        element={<DataModel />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId"
        element={<DataModel />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/settings"
        element={redirect(
          "database/:databaseId/schema/:schemaId/table/:tableId/details",
        )}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
        element={redirect(
          "database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId",
        )}
      />
    </>
  );
}
