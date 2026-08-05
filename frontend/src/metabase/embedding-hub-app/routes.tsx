import { EmbeddingThemeEditorApp } from "metabase/admin/embedding/components/ThemeEditor";
import { getRoutes as getAdminPermissionsRoutes } from "metabase/admin/permissions/routes";
import { UpsellTenants } from "metabase/admin/upsells";
import {
  SetupPermissionsAndTenantsPage,
  SetupSsoPage,
} from "metabase/embedding/embedding-hub";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { EmbeddingHubLayout } from "./components/EmbeddingHubLayout";
import {
  EmbeddingHubAppearancePage,
  EmbeddingHubAuthenticationPage,
  EmbeddingHubGetStartedPage,
  EmbeddingHubLocalizationPage,
  EmbeddingHubPermissionsPage,
  EmbeddingHubSecurityPage,
  EmbeddingHubTenancyPage,
} from "./pages";
import { CanAccessEmbeddingHub } from "./route-guards";

/**
 * The embedding hub is added alongside `/admin/embedding`, which stays untouched.
 * Removing the admin section is EMB-1526 and comes last, together with the
 * back-compat redirects.
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
        <Route path="security" element={<EmbeddingHubSecurityPage />} />
        <Route
          path="authentication"
          element={<EmbeddingHubAuthenticationPage />}
        />
        <Route path="permissions" element={<EmbeddingHubPermissionsPage />}>
          {getAdminPermissionsRoutes()}
        </Route>
        <Route path="tenancy" element={<EmbeddingHubTenancyPage />}>
          {/* Null on OSS, and on EE it is assigned during plugin init. The
              fallback mirrors admin's: without it the tab would have no child
              routes at all if this tree were ever built before init runs. */}
          {PLUGIN_TENANTS.tenantsRoutes ?? (
            <Route index element={<UpsellTenants />} />
          )}
        </Route>
        <Route path="appearance">
          <Route index element={<EmbeddingHubAppearancePage />} />
          <Route
            path=":themeId"
            element={
              <EmbeddingThemeEditorApp
                basePath={Urls.embeddingHubAppearance()}
              />
            }
          />
        </Route>
        <Route path="localization" element={<EmbeddingHubLocalizationPage />} />
      </Route>
    </Route>
  );
}
