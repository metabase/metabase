import { IndexRoute, Redirect, Route } from "react-router";

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
  return (
    <>
      <IndexRoute component={DataModel} />
      <Route path="database" component={DataModel} />
      <Route path="database/:databaseId" component={DataModel} />
      <Route
        path="database/:databaseId/schema/:schemaId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/new"
        component={IsAdmin}
      >
        <IndexRoute component={DataModelNewSegmentPage} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId"
        component={DataModelSegmentDetailPage}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/revisions"
        component={DataModelSegmentRevisionHistoryPage}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/dependencies"
          component={DataModelSegmentDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/new"
        component={IsAdmin}
      >
        <IndexRoute component={DataModelNewMeasurePage} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId"
        component={DataModelMeasureDetailPage}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/revisions"
        component={DataModelMeasureRevisionHistoryPage}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId/dependencies"
          component={DataModelMeasureDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/:tab/:fieldId"
        component={DataModel}
      />
      <Redirect
        from="database/:databaseId/schema/:schemaId/table/:tableId/settings"
        to="database/:databaseId/schema/:schemaId/table/:tableId/field"
      />
      <Redirect
        from="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
        to="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
      />
      <Redirect
        from="database/:databaseId/schema/:schemaId/table/:tableId/settings"
        to="database/:databaseId/schema/:schemaId/table/:tableId/field"
      />
      <Redirect
        from="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
        to="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
      />
    </>
  );
}
