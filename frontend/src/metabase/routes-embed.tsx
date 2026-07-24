import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import { Route, withRouteProps } from "metabase/router";

import { PublicOrEmbeddedDashboardPage } from "./public/containers/PublicOrEmbeddedDashboard";

const RoutedPublicOrEmbeddedQuestion = withRouteProps(PublicOrEmbeddedQuestion);
const RoutedPublicOrEmbeddedDashboardPage = withRouteProps(
  PublicOrEmbeddedDashboardPage,
);

export const getRoutes = () => (
  <Route>
    <Route path="embed" element={<PublicApp />}>
      <Route
        path="question/:token"
        element={<RoutedPublicOrEmbeddedQuestion />}
      />
      <Route
        path="dashboard/:token"
        element={<RoutedPublicOrEmbeddedDashboardPage />}
      />
      <Route path="*" element={<PublicNotFound />} />
    </Route>
    <Route path="*" element={<PublicNotFound />} />
  </Route>
);
