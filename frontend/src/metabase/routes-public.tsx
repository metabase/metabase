import type { Location } from "history";
import {
  Outlet,
  type RouteObject,
  useLocation,
  useParams,
} from "react-router-dom";

import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicDocument } from "metabase/public/containers/PublicDocument";
import { PublicOrEmbeddedDashboardPage } from "metabase/public/containers/PublicOrEmbeddedDashboard";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import type { EntityToken } from "metabase-types/api/entity";

const PublicAppWithOutlet = () => (
  <PublicApp>
    <Outlet />
  </PublicApp>
);

const PublicActionWithRouteProps = () => {
  const params = useParams<{ uuid?: string }>();
  return <PublicAction params={{ uuid: params.uuid ?? "" }} />;
};

const PublicQuestionWithRouteProps = () => {
  const params = useParams<{ uuid?: string }>();
  const location = useLocation();

  return (
    <PublicOrEmbeddedQuestion
      location={location as unknown as Location}
      params={{ uuid: params.uuid ?? "", token: "" as EntityToken }}
    />
  );
};

const PublicDocumentWithRouteProps = () => {
  const params = useParams<{ uuid?: string }>();
  const location = useLocation();

  return (
    <PublicDocument
      location={location as unknown as Location}
      params={{ uuid: params.uuid ?? "" }}
    />
  );
};

export const getPublicRouteObjects = (): RouteObject[] => [
  {
    path: "/public",
    element: <PublicAppWithOutlet />,
    children: [
      { path: "action/:uuid", element: <PublicActionWithRouteProps /> },
      { path: "question/:uuid", element: <PublicQuestionWithRouteProps /> },
      {
        path: "dashboard/:uuid/:tabSlug?",
        element: <PublicOrEmbeddedDashboardPage />,
      },
      { path: "document/:uuid", element: <PublicDocumentWithRouteProps /> },
      { path: "*", element: <PublicNotFound /> },
    ],
  },
  { path: "*", element: <PublicNotFound /> },
];
