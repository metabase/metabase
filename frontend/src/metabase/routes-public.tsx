import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicDocument } from "metabase/public/containers/PublicDocument";
import { PublicOrEmbeddedDashboardPage } from "metabase/public/containers/PublicOrEmbeddedDashboard";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import { Route } from "metabase/router";

export const getRoutes = () => {
  return (
    <Route>
      <Route path="public" element={<PublicApp />}>
        <Route path="action/:uuid" element={<PublicAction />} />
        <Route path="question/:uuid" element={<PublicOrEmbeddedQuestion />} />
        <Route
          path="dashboard/:uuid/:tabSlug?"
          element={<PublicOrEmbeddedDashboardPage />}
        />
        <Route path="document/:uuid" element={<PublicDocument />} />
        <Route path="*" element={<PublicNotFound />} />
      </Route>
      <Route path="*" element={<PublicNotFound />} />
    </Route>
  );
};
