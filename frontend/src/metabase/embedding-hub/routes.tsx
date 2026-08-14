import {
  SetupPermissionsAndTenantsPage,
  SetupSsoPage,
} from "metabase/embedding/setup-guide";
import { Navigate, Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { EmbeddingHubLayout } from "./components/EmbeddingHubLayout";
import { EmbeddingHubGetStartedPage } from "./pages";
import { CanAccessEmbeddingHub } from "./route-guards";

/**
 * Every tab owns a path segment, and `/embedding` redirects to the first one,
 * so no tab's path is a prefix of another's.
 *
 * The two setup wizards nest under Get started because they belong to it: that
 * keeps its tab selected while they are open, without listing their paths
 * anywhere.
 */
export function getEmbeddingHubRoutes() {
  return (
    <Route element={<CanAccessEmbeddingHub />}>
      <Route
        path={Urls.EMBEDDING_HUB_ROOT_PATH}
        element={<EmbeddingHubLayout />}
      >
        <Route
          index
          element={<Navigate to={Urls.embeddingHubGetStarted()} replace />}
        />

        <Route path="get-started">
          <Route index element={<EmbeddingHubGetStartedPage />} />
          <Route
            path="permissions-setup"
            element={<SetupPermissionsAndTenantsPage />}
          />
          <Route path="sso-setup" element={<SetupSsoPage />} />
        </Route>
      </Route>
    </Route>
  );
}
