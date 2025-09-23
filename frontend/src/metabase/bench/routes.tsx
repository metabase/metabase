import { IndexRedirect, Redirect } from "react-router";
import { t } from "ttag";

import { Route, IndexRoute } from "react-router";
import { BenchLayout } from "./BenchLayout";
import { BenchApp } from "./BenchApp";


import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp";
import SegmentListApp from "metabase/admin/datamodel/containers/SegmentListApp";
import { DataModel } from "metabase/metadata/pages/DataModel";
import { createAdminRouteGuard } from "metabase/admin/utils";

export function getBenchRoutes() {
  return (
    <Route path="/bench" title="Metabase Bench" component={BenchLayout}>
      <IndexRoute component={BenchApp} />
      <Route
        path="transform/:transformId"
        title="Transform - Metabase Bench"
        component={BenchApp}
      />
      <Route path="datamodel" component={createAdminRouteGuard("data-model")}>
        <Route title={t`Table Metadata`}>
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
