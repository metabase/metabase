import type { RouteObject } from "react-router-dom";

import { getDataStudioSegmentRouteObjects } from "metabase/data-studio/segments/routes";

import { LibrarySectionLayout } from "./LibrarySectionLayout";
import { getDataStudioMetricRouteObjects } from "./metrics/routes";
import { getDataStudioSnippetRouteObjects } from "./snippets/routes";
import { getDataStudioTableRouteObjects } from "./tables/routes";

export const getDataStudioLibraryRoutes = () => {
  return null;
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
