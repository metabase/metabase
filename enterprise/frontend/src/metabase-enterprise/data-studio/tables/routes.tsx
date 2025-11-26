import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { TableDependenciesPage } from "./pages/TableDependenciesPage";
import { TableOverviewPage } from "./pages/TableOverviewPage";

export function getDataStudioTableRoutes() {
  return (
    <Route path="tables">
      <Route path=":tableId" component={TableOverviewPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":tableId/dependencies" component={TableDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
