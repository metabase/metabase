import type { ComponentType } from "react";

import { Route, redirect } from "metabase/router";
import * as Urls from "metabase/urls";

import { getDataStudioMetricRoutes } from "./metrics/routes";
import { LibrarySectionLayout } from "./pages/LibrarySectionLayout";
import { getDataStudioTableRoutes } from "./tables/routes";

/**
 * The section layout stays eager: it frames every page under it, so it is on
 * screen before any of them arrive.
 */
export const getDataStudioLibraryRoutes = (IsAdmin: ComponentType) => {
  return (
    <Route path="library" element={<LibrarySectionLayout />}>
      <Route index element={redirect(Urls.dataStudioPublishedData())} />
      {getDataStudioTableRoutes(IsAdmin)}
      {getDataStudioMetricRoutes()}
    </Route>
  );
};
