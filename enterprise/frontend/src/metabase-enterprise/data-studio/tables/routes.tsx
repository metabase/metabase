import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { PublishedTableNewSegmentPage } from "metabase-enterprise/data-studio/segments/pages/PublishedTableNewSegmentPage";
import { PublishedTableSegmentDependenciesPage } from "metabase-enterprise/data-studio/segments/pages/PublishedTableSegmentDependenciesPage";
import { PublishedTableSegmentDetailPage } from "metabase-enterprise/data-studio/segments/pages/PublishedTableSegmentDetailPage";
import { PublishedTableSegmentRevisionHistoryPage } from "metabase-enterprise/data-studio/segments/pages/PublishedTableSegmentRevisionHistoryPage";

import { TableDependenciesPage } from "./pages/TableDependenciesPage";
import { TableFieldsPage } from "./pages/TableFieldsPage";
import { TableOverviewPage } from "./pages/TableOverviewPage";
import { TableSegmentsPage } from "./pages/TableSegmentsPage";

export function getDataStudioTableRoutes() {
  return (
    <Route path="tables">
      <Route path=":tableId" component={TableOverviewPage} />
      <Route path=":tableId/fields" component={TableFieldsPage} />
      <Route path=":tableId/fields/:fieldId" component={TableFieldsPage} />
      <Route path=":tableId/segments" component={TableSegmentsPage} />
      <Route
        path=":tableId/segments/new"
        component={PublishedTableNewSegmentPage}
      />
      <Route
        path=":tableId/segments/:segmentId"
        component={PublishedTableSegmentDetailPage}
      />
      <Route
        path=":tableId/segments/:segmentId/revisions"
        component={PublishedTableSegmentRevisionHistoryPage}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":tableId/segments/:segmentId/dependencies"
          component={PublishedTableSegmentDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":tableId/dependencies" component={TableDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
