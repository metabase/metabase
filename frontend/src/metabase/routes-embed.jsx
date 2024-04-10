import { Route } from "react-router";

import PublicNotFound from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicDashboard } from "metabase/public/containers/PublicDashboard";
import { PublicQuestion } from "metabase/public/containers/PublicQuestion";

export const getRoutes = store => (
  <Route>
    <Route path="embed" component={PublicApp}>
      <Route path="question/:token" component={PublicQuestion} />
      <Route path="dashboard/:token" component={PublicDashboard} />
      <Route path="*" component={PublicNotFound} />
    </Route>
    <Route path="*" component={PublicNotFound} />
  </Route>
);
