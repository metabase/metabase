import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { SegmentLayout } from "metabase-enterprise/data-studio/segments/layouts/SegmentLayout";
import { NewPublishedTableSegmentPage } from "metabase-enterprise/data-studio/segments/pages/NewSegmentPage/NewPublishedTableSegmentPage";
import { SegmentDependenciesPage } from "metabase-enterprise/data-studio/segments/pages/SegmentDependenciesPage";
import { SegmentDetailPage } from "metabase-enterprise/data-studio/segments/pages/SegmentDetailPage";
import { SegmentRevisionHistoryPage } from "metabase-enterprise/data-studio/segments/pages/SegmentRevisionHistoryPage";

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
        component={NewPublishedTableSegmentPage}
      />
      <Route path=":tableId/segments/:segmentId" component={SegmentLayout}>
        <IndexRoute component={SegmentDetailPage} />
        <Route path="revisions" component={SegmentRevisionHistoryPage} />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route path="dependencies" component={SegmentDependenciesPage}>
            <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
          </Route>
        )}
      </Route>
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":tableId/dependencies" component={TableDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
