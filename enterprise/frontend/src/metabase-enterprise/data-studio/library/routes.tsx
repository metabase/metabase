import type { ComponentType } from "react";

import { getDataStudioSegmentRoutes } from "metabase/data-studio/segments/routes";
import { PROTO_NAV_ENABLED } from "metabase/nav/containers/ProtoNavbar/flag";

import { LibraryPage } from "./LibraryPage";
import { LibrarySectionLayout } from "./LibrarySectionLayout";
import { getDataStudioMetricRoutes } from "./metrics/routes";
import { getDataStudioSnippetRoutes } from "./snippets/routes";
import { getDataStudioTableRoutes } from "./tables/routes";

export const getDataStudioLibraryRoutes = (IsAdmin: ComponentType) => {
  return (
    <Route path="library" component={LibrarySectionLayout}>
      <IndexRoute
        component={LibraryPage}
        onEnter={(nextState, replace) => {
          if (PROTO_NAV_ENABLED && !nextState.location.query?.library) {
            replace({
              ...nextState.location,
              query: { ...nextState.location.query, library: "tables" },
            });
          }
        }}
      />
      {getDataStudioTableRoutes(IsAdmin)}
      {getDataStudioMetricRoutes()}
      {getDataStudioSegmentRoutes()}
      {getDataStudioSnippetRoutes()}
    </Route>
  );
};
