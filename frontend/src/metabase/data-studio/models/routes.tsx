import { IndexRoute } from "react-router";

import { ModelDependenciesPage } from "metabase/data-studio/models/pages/ModelDependenciesPage";
import { ModelFieldsPage } from "metabase/data-studio/models/pages/ModelFieldsPage";
import { ModelOverviewPage } from "metabase/data-studio/models/pages/ModelOverviewPage";
import { ModelQueryPage } from "metabase/data-studio/models/pages/ModelQueryPage";
import {
  NewNativeModelPage,
  NewQueryModelPage,
} from "metabase/data-studio/models/pages/NewModelPage";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

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
