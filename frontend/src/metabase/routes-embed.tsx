import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import { Route } from "metabase/routing/compat/react-router-v3";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";

export const getRoutes = () => (
  <Route>
    <Route path="embed" component={PublicApp}>
      <Route path="question/:token" component={PublicOrEmbeddedQuestion} />
      <Route
        path="dashboard/:token"
        component={PublicOrEmbeddedDashboardPage}
      />
      <Route path="*" component={PublicNotFound} />
    </Route>
    <Route path="*" component={PublicNotFound} />
  </Route>
);
