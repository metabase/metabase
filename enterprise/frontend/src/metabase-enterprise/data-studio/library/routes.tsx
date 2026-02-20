import type { RouteObject } from "react-router-dom";

import {
  getDataStudioSegmentRouteObjects,
  getDataStudioSegmentRoutes,
} from "metabase/data-studio/segments/routes";
import { IndexRoute, Route } from "metabase/routing/compat/react-router-v3";

import { LibrarySectionLayout } from "./LibrarySectionLayout";
import {
  getDataStudioMetricRouteObjects,
  getDataStudioMetricRoutes,
} from "./metrics/routes";
import {
  getDataStudioSnippetRouteObjects,
  getDataStudioSnippetRoutes,
} from "./snippets/routes";
import {
  getDataStudioTableRouteObjects,
  getDataStudioTableRoutes,
} from "./tables/routes";

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

export const getDataStudioLibraryRouteObjects = (): RouteObject[] => {
  return [
    {
      path: "library",
      children: [
        { index: true, element: <LibrarySectionLayout /> },
        ...getDataStudioTableRouteObjects(),
        ...getDataStudioMetricRouteObjects(),
        ...getDataStudioSegmentRouteObjects(),
        ...getDataStudioSnippetRouteObjects(),
      ],
    },
  ];
};
