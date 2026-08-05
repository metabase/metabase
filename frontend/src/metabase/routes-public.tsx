import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicDocument } from "metabase/public/containers/PublicDocument";
import { PublicOrEmbeddedDashboardPage } from "metabase/public/containers/PublicOrEmbeddedDashboard";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import type { RouteObject } from "metabase/router";

export const getRoutes = (): RouteObject[] => [
  {
    children: [
      {
        path: "public",
        element: <PublicApp />,
        children: [
          { path: "action/:uuid", element: <PublicAction /> },
          { path: "question/:uuid", element: <PublicOrEmbeddedQuestion /> },
          {
            path: "dashboard/:uuid/:tabSlug?",
            element: <PublicOrEmbeddedDashboardPage />,
          },
          { path: "document/:uuid", element: <PublicDocument /> },
          { path: "*", element: <PublicNotFound /> },
        ],
      },
      { path: "*", element: <PublicNotFound /> },
    ],
  },
];
