import { Route } from "react-router";

import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedInteractive } from "metabase/public/containers/PublicOrEmbeddedInteractive";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";

export const getRoutes = store => (
  <Route>
    <Route
      path="embed/interactive/:settings"
      component={PublicOrEmbeddedInteractive}
    />

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
