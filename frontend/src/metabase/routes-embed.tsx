import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import type { RouteObject } from "metabase/router";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";

export const getRoutes = (): RouteObject[] => [
  {
    children: [
      {
        path: "embed",
        element: <PublicApp />,
        children: [
          { path: "question/:token", element: <PublicOrEmbeddedQuestion /> },
          {
            path: "dashboard/:token",
            element: <PublicOrEmbeddedDashboardPage />,
          },
          { path: "*", element: <PublicNotFound /> },
        ],
      },
      { path: "*", element: <PublicNotFound /> },
    ],
  },
];
