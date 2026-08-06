import {
  SetupPermissionsAndTenantsPage,
  SetupSsoPage,
} from "metabase/embedding/setup-guide";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { EmbeddingHubLayout } from "./components/EmbeddingHubLayout";
import { EmbeddingHubGetStartedPage } from "./pages";
import { CanAccessEmbeddingHub } from "./route-guards";

/**
 * The embedding hub is added alongside `/admin/embedding`, which stays untouched.
 * Removing the admin section is EMB-1526 and comes last, together with the
 * back-compat redirects.
 *
 * One tab today. The remaining six arrive with their own issues, each adding a
 * route here, an export to `pages/index.ts` and a tab to the nav.
 */
export function getEmbeddingHubRoutes() {
  return (
    <Route element={<CanAccessEmbeddingHub />}>
      <Route
        path={Urls.EMBEDDING_HUB_ROOT_PATH}
        element={<EmbeddingHubLayout />}
      >
        <Route index element={<EmbeddingHubGetStartedPage />} />
        <Route
          path="permissions-setup"
          element={<SetupPermissionsAndTenantsPage />}
        />
        <Route path="sso-setup" element={<SetupSsoPage />} />
      </Route>
    </Route>
  );
}
