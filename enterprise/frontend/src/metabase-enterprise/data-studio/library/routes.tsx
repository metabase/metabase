import type { ComponentType } from "react";

import { libraryUpsellPage } from "metabase/data-studio/routes";
import type { PluginRoute } from "metabase/plugins/types";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

import { getDataStudioMetricRoutes } from "./metrics/routes";
import { LibrarySectionLayout } from "./pages/LibrarySectionLayout";
import { getDataStudioTableRoutes } from "./tables/routes";

/**
 * The section layout stays eager: it frames every page under it, so it is on
 * screen before any of them arrive.
 */
const librarySectionLayout: PluginRoute = () =>
  Promise.resolve({ Component: LibrarySectionLayout });

const libraryPage = () =>
  import(
    /* webpackChunkName: "data-studio-library" */ "./pages/LibraryPage"
  ).then(({ LibraryPage }) => ({ Component: LibraryPage }));

export const getDataStudioLibraryRoutes = (IsAdmin: ComponentType) => {
  return (
    <Route
      path="library"
      lazy={featureGatedRoute(
        "library",
        librarySectionLayout,
        libraryUpsellPage,
      )}
    >
      <Route index lazy={libraryPage} />
      {getDataStudioTableRoutes(IsAdmin)}
      {getDataStudioMetricRoutes()}
    </Route>
  );
};
