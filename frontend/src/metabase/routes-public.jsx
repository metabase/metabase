import { Route } from "react-router";

import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicDocument } from "metabase/public/containers/PublicDocument";
import { PublicOrEmbeddedDashboardPage } from "metabase/public/containers/PublicOrEmbeddedDashboard";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";

export const getRoutes = (store) => {
  return (
    <Route>
      <Route path="public" component={PublicApp}>
        <Route path="action/:uuid" component={PublicAction} />
        <Route path="question/:uuid" component={PublicOrEmbeddedQuestion} />
        <Route
          path="dashboard/:uuid(/:tabSlug)"
          component={PublicOrEmbeddedDashboardPage}
        />
        <Route path="document/:uuid" component={PublicDocument} />
        <Route path="*" component={PublicNotFound} />
      </Route>
      <Route path="*" component={PublicNotFound} />
    </Route>
  );
};
