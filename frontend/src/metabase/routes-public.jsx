import { Route } from "metabase/hoc/Title";
import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";
import { getApplicationName } from "./selectors/whitelabel";

export const getRoutes = store => {
  const applicationName = getApplicationName(store.getState());
  return (
    <Route title={applicationName}>
      <Route path="public" component={PublicApp}>
        <Route path="action/:uuid" component={PublicAction} />
        <Route path="question/:uuid" component={PublicOrEmbeddedQuestion} />
        <Route
          path="dashboard/:uuid(/:tabSlug)"
          component={PublicOrEmbeddedDashboardPage}
        />
        <Route path="*" component={PublicNotFound} />
      </Route>
      <Route path="*" component={PublicNotFound} />
    </Route>
  );
};
