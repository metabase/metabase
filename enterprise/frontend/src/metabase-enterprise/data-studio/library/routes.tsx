import { IndexRoute, Route } from "react-router";

import { getDataStudioSegmentRoutes } from "metabase/data-studio/segments/routes";

import { LibraryPage } from "./LibraryPage";
import { LibrarySectionLayout } from "./LibrarySectionLayout";
import { getDataStudioMetricRoutes } from "./metrics/routes";
import { getDataStudioSnippetRoutes } from "./snippets/routes";
import { getDataStudioTableRoutes } from "./tables/routes";

export const getDataStudioLibraryRoutes = () => {
  return (
    <Route path="library" component={LibrarySectionLayout}>
      <IndexRoute component={LibraryPage} />
      {getDataStudioTableRoutes()}
      {getDataStudioMetricRoutes()}
      {getDataStudioSegmentRoutes()}
      {getDataStudioSnippetRoutes()}
    </Route>
  );
};
