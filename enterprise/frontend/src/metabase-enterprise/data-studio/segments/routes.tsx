import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { SegmentLayout } from "./layouts/SegmentLayout";
import { NewDataModelSegmentPage } from "./pages/NewSegmentPage";
import { SegmentDependenciesPage } from "./pages/SegmentDependenciesPage";
import { SegmentDetailPage } from "./pages/SegmentDetailPage";
import { SegmentRevisionHistoryPage } from "./pages/SegmentRevisionHistoryPage";

export function getDataStudioSegmentRoutes() {
  return (
    <>
      <Route path="segments/new" component={NewDataModelSegmentPage} />
      <Route path="segments/:segmentId" component={SegmentLayout}>
        <IndexRoute component={SegmentDetailPage} />
        <Route path="revisions" component={SegmentRevisionHistoryPage} />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route path="dependencies" component={SegmentDependenciesPage}>
            <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
          </Route>
        )}
      </Route>
    </>
  );
}
