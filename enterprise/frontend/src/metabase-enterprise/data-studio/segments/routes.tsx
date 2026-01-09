import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { NewSegmentPage } from "./pages/NewSegmentPage";
import { SegmentDependenciesPage } from "./pages/SegmentDependenciesPage";
import { SegmentDetailPage } from "./pages/SegmentDetailPage";
import { SegmentRevisionHistoryPage } from "./pages/SegmentRevisionHistoryPage";

export function getDataStudioSegmentRoutes() {
  return (
    <Route path="segments">
      <Route path="new" component={NewSegmentPage} />
      <Route path=":segmentId" component={SegmentDetailPage} />
      <Route path=":segmentId/history" component={SegmentRevisionHistoryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":segmentId/dependencies"
          component={SegmentDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
