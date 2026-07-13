import type { ComponentType } from "react";

import { getDataStudioSegmentRoutes } from "metabase/data-studio/segments/routes";
import { Route } from "metabase/router";

import { LibraryPage } from "./LibraryPage";
import { LibrarySectionLayout } from "./LibrarySectionLayout";
import { getDataStudioMetricRoutes } from "./metrics/routes";
import { getDataStudioSnippetRoutes } from "./snippets/routes";
import { getDataStudioTableRoutes } from "./tables/routes";

export const getDataStudioLibraryRoutes = (IsAdmin: ComponentType) => {
  return (
    <Route path="library" component={LibrarySectionLayout}>
      <Route index component={LibraryPage} />
      {getDataStudioTableRoutes(IsAdmin)}
      {getDataStudioMetricRoutes()}
      {getDataStudioSegmentRoutes()}
      {getDataStudioSnippetRoutes()}
    </Route>
  );
};
