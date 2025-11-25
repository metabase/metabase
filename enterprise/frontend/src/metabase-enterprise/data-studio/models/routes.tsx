import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { ModelDependenciesPage } from "./pages/ModelDependenciesPage";
import { ModelFieldsPage } from "./pages/ModelFieldsPage";
import { ModelOverviewPage } from "./pages/ModelOverviewPage";
import { ModelQueryPage } from "./pages/ModelQueryPage";
import { NewNativeModelPage, NewQueryModelPage } from "./pages/NewModelPage";

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
