import { IndexRedirect, IndexRoute, Redirect } from "react-router";

import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { ModelDetailPage } from "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { ModelDependenciesPage } from "./pages/ModelDependenciesPage";
import { ModelFieldsPage } from "./pages/ModelFieldsPage";
import { ModelOverviewPage } from "./pages/ModelOverviewPage";
import { ModelQueryPage } from "./pages/ModelQueryPage";
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
      <Route path=":cardId" component={ModelOverviewPage} />
      <Route path=":cardId/query" component={ModelQueryPage} />
      <Route path=":cardId/fields" component={ModelFieldsPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":cardId/dependencies" component={ModelDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
