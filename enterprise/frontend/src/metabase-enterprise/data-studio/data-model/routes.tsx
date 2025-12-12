import { IndexRoute, Redirect, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { DataModelNewSegmentPage } from "metabase-enterprise/data-studio/segments/pages/DataModelNewSegmentPage";
import { DataModelSegmentDependenciesPage } from "metabase-enterprise/data-studio/segments/pages/DataModelSegmentDependenciesPage";
import { DataModelSegmentDetailPage } from "metabase-enterprise/data-studio/segments/pages/DataModelSegmentDetailPage";
import { DataModelSegmentRevisionHistoryPage } from "metabase-enterprise/data-studio/segments/pages/DataModelSegmentRevisionHistoryPage";

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
        component={DataModelNewSegmentPage}
      />
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
