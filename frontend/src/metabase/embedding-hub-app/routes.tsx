import { EmbeddingThemeEditorApp } from "metabase/admin/embedding/components/ThemeEditor";
import { EmbeddingThemeListingApp } from "metabase/admin/embedding/components/ThemeListing";
import { EmbeddingHubAdminSettingsPage } from "metabase/admin/embedding/embedding-hub";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { EmbeddingHubLayout } from "./components/EmbeddingHubLayout";
import {
  EmbeddingHubAuthenticationPage,
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
        <Route index element={<EmbeddingHubAdminSettingsPage />} />
        <Route path="security" element={<EmbeddingHubSecurityPage />} />
        <Route
          path="authentication"
          element={<EmbeddingHubAuthenticationPage />}
        />
        <Route path="permissions" element={<EmbeddingHubPermissionsPage />} />
        <Route path="tenancy" element={<EmbeddingHubTenancyPage />} />
        <Route path="appearance">
          <Route
            index
            element={
              <EmbeddingThemeListingApp
                basePath={Urls.embeddingHubAppearance()}
              />
            }
          />
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
