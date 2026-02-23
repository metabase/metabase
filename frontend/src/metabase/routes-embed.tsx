import type { Location } from "history";
import {
  Outlet,
  type RouteObject,
  useLocation,
  useParams,
} from "react-router-dom";

import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import type { EntityToken } from "metabase-types/api/entity";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";

const PublicAppWithOutlet = () => (
  <PublicApp>
    <Outlet />
  </PublicApp>
);

const EmbeddedQuestionWithRouteProps = () => {
  const params = useParams<{ token?: string }>();
  const location = useLocation();

  return (
    <PublicOrEmbeddedQuestion
      location={location as unknown as Location}
      params={{ uuid: "", token: (params.token ?? "") as EntityToken }}
    />
  );
};

export const getEmbedRouteObjects = (): RouteObject[] => [
  {
    path: "/embed",
    element: <PublicAppWithOutlet />,
    children: [
      { path: "question/:token", element: <EmbeddedQuestionWithRouteProps /> },
      { path: "dashboard/:token", element: <PublicOrEmbeddedDashboardPage /> },
      { path: "*", element: <PublicNotFound /> },
    ],
  },
  { path: "*", element: <PublicNotFound /> },
];
