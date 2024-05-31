import { Route } from "react-router";

import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedDashboardControlled } from "metabase/public/containers/PublicOrEmbeddedDashboard";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";

export const getRoutes = store => (
  <Route>
    <Route path="embed" component={PublicApp}>
      <Route path="question/:token" component={PublicOrEmbeddedQuestion} />
      <Route
        path="dashboard/:token"
        component={PublicOrEmbeddedDashboardControlled}
      />
      <Route path="*" component={PublicNotFound} />
    </Route>
    <Route path="*" component={PublicNotFound} />
  </Route>
);
