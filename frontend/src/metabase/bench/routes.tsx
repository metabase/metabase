import { IndexRedirect, IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import SegmentApp, { CreateSegmentForm, UpdateSegmentForm } from "metabase/admin/datamodel/containers/SegmentApp";
import { createAdminRouteGuard } from "metabase/admin/utils";
import { BrowseMetrics, BrowseModels } from "metabase/browse";
import NotFoundFallbackPage from "metabase/common/components/NotFoundFallbackPage";
import { Route } from "metabase/hoc/Title";
import type { AppStore } from "metabase/lib/redux";
import { DataModel } from "metabase/metadata/pages/DataModel";
import {
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { DatasetEditor } from "metabase/query_builder/components/DatasetEditor";

import { BenchApp } from "./components/BenchApp";
import { EmptySailboat } from "./components/BenchLayout";
import { OverviewPage } from "./components/OverviewPage";
import { MetricEditor, MetricsLayout } from "./components/metrics/MetricsList";
import { ModelMetadataEditor, ModelsLayout, ModelsList } from "./components/models/ModelsList";

export const getBenchRoutes = (
  store: AppStore,
  CanAccessSettings: boolean,
  _IsAdmin: boolean,
) => (
  <Route path="/bench" component={CanAccessSettings}>
    <Route title={t`Bench`} component={BenchApp}>
      <IndexRedirect to="overview" />
      <Route path="overview" component={() => <OverviewPage />} />
      {PLUGIN_TRANSFORMS.getAdminRoutes()}
      <Route path="segment" component={SegmentApp}>
        <Route path="new" component={CreateSegmentForm} />
        <Route path=":id" component={UpdateSegmentForm} />
        <Route path=":id/revisions" component={RevisionHistoryApp} />
      </Route>

      <Route path="model" component={ModelsLayout}>
        <IndexRoute component={EmptySailboat} />
        <Route path=":id" component={ModelMetadataEditor} />
      </Route>
      <Route path="metric" component={MetricsLayout} >
        <IndexRoute component={EmptySailboat} />
        <Route path=":id" component={MetricEditor} />
      </Route>
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
