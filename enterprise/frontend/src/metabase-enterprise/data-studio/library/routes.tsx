import { IndexRoute, Route } from "react-router";

import { getDataStudioMetricRoutes } from "metabase/data-studio/metrics/routes";
import { getDataStudioSegmentRoutes } from "metabase/data-studio/segments/routes";
import { getDataStudioSnippetRoutes } from "metabase/data-studio/snippets/routes";
import { getDataStudioTableRoutes } from "metabase/data-studio/tables/routes";

import { LibrarySectionLayout } from "./LibrarySectionLayout";

export const getDataStudioLibraryRoutes = () => {
  return (
    <Route path="library">
      <IndexRoute component={LibrarySectionLayout} />
      {getDataStudioTableRoutes()}
      {getDataStudioMetricRoutes()}
      {getDataStudioSegmentRoutes()}
      {getDataStudioSnippetRoutes()}
    </Route>
  );
};
