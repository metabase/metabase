import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { MeasureDependenciesPage } from "./pages/MeasureDependenciesPage";
import { MeasureDetailPage } from "./pages/MeasureDetailPage";
import { MeasureRevisionHistoryPage } from "./pages/MeasureRevisionHistoryPage";
import { NewMeasurePage } from "./pages/NewMeasurePage";

export function getDataStudioMeasureRoutes() {
  return (
    <Route path="measures">
      <Route path="new" component={NewMeasurePage} />
      <Route path=":measureId" component={MeasureDetailPage} />
      <Route path=":measureId/history" component={MeasureRevisionHistoryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":measureId/dependencies"
          component={MeasureDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
