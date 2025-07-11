import { Route } from "metabase/hoc/Title";
import { PLUGIN_DATA_APPS } from "metabase/plugins";
import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";
import { getApplicationName } from "./selectors/whitelabel";

export const getRoutes = (store) => {
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
        {PLUGIN_DATA_APPS.isEnabled() && (
          <Route
            path="app/:appUrl"
            component={PLUGIN_DATA_APPS.PUBLIC_APP_PAGE_COMPONENT}
          />
        )}
        <Route path="*" component={PublicNotFound} />
      </Route>
      <Route path="*" component={PublicNotFound} />
    </Route>
  );
};
