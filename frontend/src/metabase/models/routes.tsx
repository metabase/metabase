import { IndexRedirect, IndexRoute, Redirect } from "react-router";

import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { ModelDetailPage } from "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { MetricDependenciesPage } from "./pages/MetricDependenciesPage";
import { MetricOverviewPage } from "./pages/MetricOverviewPage";
import { MetricQueryPage } from "./pages/MetricQueryPage";
import { ModelDependenciesPage } from "./pages/ModelDependenciesPage";
import { ModelOverviewPage } from "./pages/ModelOverviewPage";
import { ModelQueryPage } from "./pages/ModelQueryPage";
import { NewNativeMetricPage, NewQueryMetricPage } from "./pages/NewMetricPage";
import { NewNativeModelPage, NewQueryModelPage } from "./pages/NewModelPage";

export const getRoutes = () => (
  <Route path="/model/:slug/detail">
    <Route path="actions" component={ModelActions}>
      <ModalRoute
        path="new"
        modal={ActionCreatorModal}
        modalProps={{
          wide: true,
          enableTransition: false,
          closeOnClickOutside: false, // logic in component is reversed, so false is true.
        }}
      />
      <ModalRoute
        path=":actionId"
        modal={ActionCreatorModal}
        modalProps={{
          wide: true,
          enableTransition: false,
          closeOnClickOutside: false, // logic in component is reversed, so false is true.
        }}
      />
    </Route>
    <Route path=":rowId" component={ModelDetailPage} />
    <IndexRedirect to="actions" />
    <Redirect from="usage" to="actions" />
    <Redirect from="schema" to="actions" />
    <Redirect from="*" to="actions" />
  </Route>
);

export function getDataStudioModelRoutes() {
  return (
    <Route path="models">
      <Route path="new/query" component={NewQueryModelPage} />
      <Route path="new/native" component={NewNativeModelPage} />
      <Route path=":modelId" component={ModelOverviewPage} />
      <Route path=":modelId/query" component={ModelQueryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":modelId/dependencies" component={ModelDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}

export function getDataStudioMetricRoutes() {
  return (
    <Route path="metrics">
      <Route path="new/query" component={NewQueryMetricPage} />
      <Route path="new/native" component={NewNativeMetricPage} />
      <Route path=":metricId" component={MetricOverviewPage} />
      <Route path=":metricId/query" component={MetricQueryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":metricId/dependencies" component={MetricDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
