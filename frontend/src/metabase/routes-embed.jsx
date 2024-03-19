import { Route } from "react-router";

import PublicNotFound from "metabase/public/components/PublicNotFound";

import PublicApp from "metabase/public/containers/PublicApp";
import { PublicQuestion } from "metabase/public/containers/PublicQuestion";
import { IFrameWrapper } from "metabase/iframe/IFrameWrapper";
import { PublicDashboardRouterWrapper } from "./public/containers/PublicDashboardRouterWrapper";

export const getRoutes = store => (
  <Route>
    <Route path="embed" component={PublicApp}>
      <Route path="question/:token" component={PublicQuestion} />
      <Route path="dashboard/:token" component={PublicDashboardRouterWrapper} />
      <Route path="sdk/question/:id" component={IFrameWrapper} />
      <Route path="*" component={PublicNotFound} />
    </Route>
    <Route path="*" component={PublicNotFound} />
  </Route>
);
