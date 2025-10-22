import { IndexRedirect, IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import {
  CreateSegmentForm,
  SegmentApp,
  UpdateSegmentForm,
} from "metabase/admin/datamodel/containers/SegmentApp";
import NotFoundFallbackPage from "metabase/common/components/NotFoundFallbackPage";
import { Route } from "metabase/hoc/Title";
import { DataModel } from "metabase/metadata/pages/DataModel";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { GlossaryContainer } from "metabase/reference/glossary/GlossaryContainer";

import { BenchApp } from "./components/BenchApp";
import { EmptySailboat } from "./components/BenchLayout";
import { OverviewPage } from "./components/OverviewPage";
import {
  MetricEditor,
  MetricSettings,
  MetricsLayout,
} from "./components/metrics/MetricsList";
import {
  ModelEditor,
  ModelSettings,
  ModelsLayout,
} from "./components/models/ModelsList";
import {
  SnippetEditor,
  SnippetsLayout,
} from "./components/snippets/SnippetsList";

export const getBenchRoutes = () => (
  <Route path="/bench">
    <Route title={t`Bench`} component={BenchApp}>
      <IndexRedirect to="overview" />
      <Route path="overview" component={() => <OverviewPage />} />
      {PLUGIN_TRANSFORMS.getTransformRoutes()}
      <Route path="segment" component={SegmentApp}>
        <Route path="new" component={CreateSegmentForm} />
        <Route path=":id" component={UpdateSegmentForm} />
        <Route path=":id/revisions" component={RevisionHistoryApp} />
      </Route>

      <Route path="model" component={ModelsLayout}>
        <IndexRoute component={EmptySailboat} />
        <Route path="new/:type" component={ModelEditor} />
        <Route path=":slug" component={ModelEditor} />
        <Route path=":slug/settings" component={ModelSettings} />
      </Route>
      <Route path="metric" component={MetricsLayout}>
        <IndexRoute component={EmptySailboat} />
        <Route path=":slug" component={MetricEditor} />
        <Route path=":slug/settings" component={MetricSettings} />
      </Route>
      <Route path="snippet" component={SnippetsLayout}>
        <IndexRoute component={EmptySailboat} />
        <Route path="new" component={SnippetEditor} />
        <Route path=":id" component={SnippetEditor} />
      </Route>
      <Route path="glossary" component={GlossaryContainer} />
      <Route path="dependencies" component={EmptySailboat} />
      <Route path="metadata">
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
          <Route
            path="collection/:collectionId/model/:modelId"
            component={DataModel}
          />
          <Route
            path="collection/:collectionId/model/:modelId/field/:fieldName"
            component={DataModel}
          />
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
      <Route path="*" component={NotFoundFallbackPage} />
    </Route>
  </Route>
);
