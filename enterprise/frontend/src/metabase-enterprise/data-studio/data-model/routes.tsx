import { IndexRoute, Redirect, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { DataModelSegmentLayout } from "metabase-enterprise/data-studio/segments/layouts/DataModelSegmentLayout";
import { NewSegmentPage } from "metabase-enterprise/data-studio/segments/pages/NewSegmentPage";
import { SegmentDependenciesPage } from "metabase-enterprise/data-studio/segments/pages/SegmentDependenciesPage";
import { SegmentDetailPage } from "metabase-enterprise/data-studio/segments/pages/SegmentDetailPage";
import { SegmentRevisionHistoryPage } from "metabase-enterprise/data-studio/segments/pages/SegmentRevisionHistoryPage";

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
        component={DataModelSegmentLayout}
      >
        <IndexRoute component={NewSegmentPage} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId"
        component={DataModelSegmentLayout}
      >
        <IndexRoute component={SegmentDetailPage} />
        <Route path="revisions" component={SegmentRevisionHistoryPage} />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route path="dependencies" component={SegmentDependenciesPage}>
            <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
          </Route>
        )}
      </Route>
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
