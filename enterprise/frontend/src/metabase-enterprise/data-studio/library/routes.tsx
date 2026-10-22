import type { ComponentType } from "react";

import { Route } from "metabase/router";

import { getDataStudioMetricRoutes } from "./metrics/routes";
import { LibrarySectionLayout } from "./pages/LibrarySectionLayout";
import { getDataStudioTableRoutes } from "./tables/routes";

/**
 * The section layout stays eager: it frames every page under it, so it is on
 * screen before any of them arrive.
 */
const libraryPage = () =>
  import(
    /* webpackChunkName: "data-studio-library" */ "./pages/LibraryPage"
  ).then(({ LibraryPage }) => ({ Component: LibraryPage }));

export const getDataStudioLibraryRoutes = (IsAdmin: ComponentType) => {
  return (
    <Route path="library" element={<LibrarySectionLayout />}>
      <Route index lazy={libraryPage} />
      {getDataStudioTableRoutes(IsAdmin)}
      {getDataStudioMetricRoutes()}
    </Route>
  );
};
