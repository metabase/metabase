import type { ComponentType } from "react";

import { Route } from "metabase/router";

import { LibraryPage } from "./LibraryPage";
import { LibrarySectionLayout } from "./LibrarySectionLayout";
import { getDataStudioMetricRoutes } from "./metrics/routes";
import { getDataStudioSnippetRoutes } from "./snippets/routes";
import { getDataStudioTableRoutes } from "./tables/routes";

export const getDataStudioLibraryRoutes = (IsAdmin: ComponentType) => {
  return (
    <Route path="library" element={<LibrarySectionLayout />}>
      <Route index element={<LibraryPage />} />
      {getDataStudioTableRoutes(IsAdmin)}
      {getDataStudioMetricRoutes()}
      {getDataStudioSnippetRoutes()}
    </Route>
  );
};
