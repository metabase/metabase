import { IndexRedirect, Redirect } from "react-router";
import { t } from "ttag";

import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp";
import SegmentListApp from "metabase/admin/datamodel/containers/SegmentListApp";
import { createAdminRouteGuard } from "metabase/admin/utils";
import { BrowseMetrics } from "metabase/browse";
import NotFoundFallbackPage from "metabase/common/components/NotFoundFallbackPage";
import { Route } from "metabase/hoc/Title";
import type { AppStore } from "metabase/lib/redux";
import { DataModel } from "metabase/metadata/pages/DataModel";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { BenchApp } from "./components/BenchApp";
import { ModelsBenchSection } from "./components/models/ModelsBenchSection";

export const getBenchRoutes = (
  store: AppStore,
  CanAccessSettings: boolean,
  _IsAdmin: boolean,
) => (
  <Route path="/bench" component={CanAccessSettings}>
    <Route title={t`Bench`} component={BenchApp}>
      <IndexRedirect to="overview" />
      <Route path="overview" component={() => <div>{t`Overview`}</div>} />
      {PLUGIN_TRANSFORMS.getAdminRoutes()}
      <Route path="segments" component={SegmentListApp} />
      <Route path="models" component={ModelsBenchSection} />
      <Route path="metrics" component={BrowseMetrics} />

      <Route path="metadata" component={createAdminRouteGuard("data-model")}>
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
      <Route path="/*" component={NotFoundFallbackPage} />
    </Route>
  </Route>
);
