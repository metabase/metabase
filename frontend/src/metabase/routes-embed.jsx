import { Route } from "react-router";

import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";

export const getRoutes = (store) => (
  <Route>
    {PLUGIN_EMBEDDING_IFRAME_SDK.InteractiveEmbedRoute && (
      <Route
        path="embed/interactive/:settings"
        component={PLUGIN_EMBEDDING_IFRAME_SDK.InteractiveEmbedRoute}
      />
    )}
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
