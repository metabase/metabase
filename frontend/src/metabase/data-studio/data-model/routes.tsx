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
import { Route, redirect, withRouteProps } from "metabase/router";

import { DataModel } from "./pages/DataModel";

const RoutedDataModel = withRouteProps(DataModel);
const RoutedDataModelNewSegmentPage = withRouteProps(DataModelNewSegmentPage);
const RoutedDataModelSegmentDetailPage = withRouteProps(
  DataModelSegmentDetailPage,
);
const RoutedDataModelSegmentRevisionHistoryPage = withRouteProps(
  DataModelSegmentRevisionHistoryPage,
);
const RoutedDataModelSegmentDependenciesPage = withRouteProps(
  DataModelSegmentDependenciesPage,
);
const RoutedDataModelNewMeasurePage = withRouteProps(DataModelNewMeasurePage);
const RoutedDataModelMeasureDetailPage = withRouteProps(
  DataModelMeasureDetailPage,
);
const RoutedDataModelMeasureRevisionHistoryPage = withRouteProps(
  DataModelMeasureRevisionHistoryPage,
);
const RoutedDataModelMeasureDependenciesPage = withRouteProps(
  DataModelMeasureDependenciesPage,
);

export function getDataStudioMetadataRoutes(IsAdmin: ComponentType) {
  return (
    <>
      <Route index element={<RoutedDataModel />} />
      <Route path="database" element={<RoutedDataModel />} />
      <Route path="database/:databaseId" element={<RoutedDataModel />} />
      <Route
        path="database/:databaseId/schema/:schemaId"
        element={<RoutedDataModel />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        element={<RoutedDataModel />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/new"
        element={<IsAdmin />}
      >
        <Route index element={<RoutedDataModelNewSegmentPage />} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId"
        element={<RoutedDataModelSegmentDetailPage />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/revisions"
        element={<RoutedDataModelSegmentRevisionHistoryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/dependencies"
          element={<RoutedDataModelSegmentDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/new"
        element={<IsAdmin />}
      >
        <Route index element={<RoutedDataModelNewMeasurePage />} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId"
        element={<RoutedDataModelMeasureDetailPage />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/revisions"
        element={<RoutedDataModelMeasureRevisionHistoryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/dependencies"
          element={<RoutedDataModelMeasureDependenciesPage />}
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
        element={<RoutedDataModel />}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId"
        element={<RoutedDataModel />}
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
