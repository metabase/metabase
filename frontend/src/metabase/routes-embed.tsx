import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import { Route } from "metabase/router";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";

export const getRoutes = () => (
  <Route>
    <Route path="embed" element={<PublicApp />}>
      <Route path="question/:token" element={<PublicOrEmbeddedQuestion />} />
      <Route
        path="dashboard/:token"
        element={<PublicOrEmbeddedDashboardPage />}
      />
      <Route path="*" element={<PublicNotFound />} />
    </Route>
    <Route path="*" element={<PublicNotFound />} />
  </Route>
);
