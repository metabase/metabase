import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicDocument } from "metabase/public/containers/PublicDocument";
import { PublicOrEmbeddedDashboardPage } from "metabase/public/containers/PublicOrEmbeddedDashboard";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import { Route, withRouteProps } from "metabase/router";

const RoutedPublicAction = withRouteProps(PublicAction);
const RoutedPublicOrEmbeddedQuestion = withRouteProps(PublicOrEmbeddedQuestion);
const RoutedPublicOrEmbeddedDashboardPage = withRouteProps(
  PublicOrEmbeddedDashboardPage,
);
const RoutedPublicDocument = withRouteProps(PublicDocument);

export const getRoutes = () => {
  return (
    <Route>
      <Route path="public" element={<PublicApp />}>
        <Route path="action/:uuid" element={<RoutedPublicAction />} />
        <Route
          path="question/:uuid"
          element={<RoutedPublicOrEmbeddedQuestion />}
        />
        <Route
          path="dashboard/:uuid(/:tabSlug)"
          element={<RoutedPublicOrEmbeddedDashboardPage />}
        />
        <Route path="document/:uuid" element={<RoutedPublicDocument />} />
        <Route path="*" element={<PublicNotFound />} />
      </Route>
      <Route path="*" element={<PublicNotFound />} />
    </Route>
  );
};
