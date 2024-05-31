import { Route } from "metabase/hoc/Title";
import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicDashboardControlled } from "metabase/public/containers/PublicDashboard";
import { PublicQuestion } from "metabase/public/containers/PublicQuestion";

import { getApplicationName } from "./selectors/whitelabel";

export const getRoutes = store => {
  const applicationName = getApplicationName(store.getState());
  return (
    <Route title={applicationName}>
      <Route path="public" component={PublicApp}>
        <Route path="action/:uuid" component={PublicAction} />
        <Route path="question/:uuid" component={PublicQuestion} />
        <Route
          path="dashboard/:uuid(/:tabSlug)"
          component={PublicDashboardControlled}
        />
        <Route path="*" component={PublicNotFound} />
      </Route>
      <Route path="*" component={PublicNotFound} />
    </Route>
  );
};
