import { IndexRoute, Redirect, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { DataModelMeasureLayout } from "metabase-enterprise/data-studio/measures/layouts/DataModelMeasureLayout";
import { MeasureDependenciesPage } from "metabase-enterprise/data-studio/measures/pages/MeasureDependenciesPage";
import { MeasureDetailPage } from "metabase-enterprise/data-studio/measures/pages/MeasureDetailPage";
import { MeasureRevisionHistoryPage } from "metabase-enterprise/data-studio/measures/pages/MeasureRevisionHistoryPage";
import { NewMeasurePage } from "metabase-enterprise/data-studio/measures/pages/NewMeasurePage";
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
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/new"
        component={DataModelMeasureLayout}
      >
        <IndexRoute component={NewMeasurePage} />
      </Route>
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/measures/:measureId"
        component={DataModelMeasureLayout}
      >
        <IndexRoute component={MeasureDetailPage} />
        <Route path="revisions" component={MeasureRevisionHistoryPage} />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route path="dependencies" component={MeasureDependenciesPage}>
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
