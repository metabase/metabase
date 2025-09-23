import { IndexRedirect, IndexRoute, Redirect, Route } from "react-router";

import { BenchApp } from "./BenchApp";
import { BenchLayout } from "./BenchLayout";
import RevisionHistoryApp from "./metadata/containers/RevisionHistoryApp";
import SegmentApp from "./metadata/containers/SegmentApp";
import SegmentListApp from "./metadata/containers/SegmentListApp";
import { DataModel } from "./metadata/pages/DataModel/DataModel";

export function getBenchRoutes() {
  return (
    // eslint-disable-next-line no-literal-metabase-strings -- This is for the bench section
    <Route path="/bench" component={BenchLayout}>
      <IndexRoute component={BenchApp} />
      <Route
        path="transform/:transformId"
        component={BenchApp}
      />
      <Route path="metadata">
        <Route>
          <IndexRedirect to="database" />
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
            path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
            component={DataModel}
          />
          <Route component={DataModel}>
            <Route path="segments" component={SegmentListApp} />
            <Route path="segment/create" component={SegmentApp} />
            <Route path="segment/:id" component={SegmentApp} />
            <Route
              path="segment/:id/revisions"
              component={RevisionHistoryApp}
            />
          </Route>
          <Redirect
            from="database/:databaseId/schema/:schemaId/table/:tableId/settings"
            to="database/:databaseId/schema/:schemaId/table/:tableId"
          />
          <Redirect
            from="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
            to="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
          />
        </Route>
      </Route>
    </Route>
  );
}
