import { getRoutes as getAdminPermissionsRoutes } from "metabase/admin/permissions/routes";
import { UpsellTenants } from "metabase/admin/upsells";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Navigate, Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { CanAccessEmbeddingHub } from "./route-guards";

/**
 * The hub pages, in their own chunk. The access guard stays eager: it has to
 * decide before there is anything to show.
 */
const embeddingHubLayout = () =>
  import("./components/EmbeddingHubLayout").then(({ EmbeddingHubLayout }) => ({
    Component: EmbeddingHubLayout,
  }));

const embeddingHubGetStartedPage = () =>
  import("./pages").then(({ EmbeddingHubGetStartedPage }) => ({
    Component: EmbeddingHubGetStartedPage,
  }));

const embeddingHubSecurityPage = () =>
  import("./pages").then(({ EmbeddingHubSecurityPage }) => ({
    Component: EmbeddingHubSecurityPage,
  }));

const embeddingHubAuthenticationPage = () =>
  import("./pages").then(({ EmbeddingHubAuthenticationPage }) => ({
    Component: EmbeddingHubAuthenticationPage,
  }));

const embeddingHubPermissionsPage = () =>
  import("./pages").then(({ EmbeddingHubPermissionsPage }) => ({
    Component: EmbeddingHubPermissionsPage,
  }));

const embeddingHubTenancyPage = () =>
  import("./pages").then(({ EmbeddingHubTenancyPage }) => ({
    Component: EmbeddingHubTenancyPage,
  }));

const setupPermissionsAndTenantsPage = () =>
  import("metabase/embedding/setup-guide").then(
    ({ SetupPermissionsAndTenantsPage }) => ({
      Component: SetupPermissionsAndTenantsPage,
    }),
  );

const setupSsoPage = () =>
  import("metabase/embedding/setup-guide").then(({ SetupSsoPage }) => ({
    Component: SetupSsoPage,
  }));

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
      <Route path={Urls.EMBEDDING_HUB_ROOT_PATH} lazy={embeddingHubLayout}>
        <Route
          index
          element={<Navigate to={Urls.embeddingHubGetStarted()} replace />}
        />

        <Route path="get-started">
          <Route index lazy={embeddingHubGetStartedPage} />
          <Route
            path="permissions-setup"
            lazy={setupPermissionsAndTenantsPage}
          />
          <Route path="sso-setup" lazy={setupSsoPage} />
        </Route>

        <Route path="security" lazy={embeddingHubSecurityPage} />

        <Route path="authentication" lazy={embeddingHubAuthenticationPage} />

        <Route path="permissions" lazy={embeddingHubPermissionsPage}>
          {getAdminPermissionsRoutes()}
        </Route>
        <Route path="tenancy" lazy={embeddingHubTenancyPage}>
          {/* Null on OSS, and on EE it is assigned during plugin init. The
              fallback mirrors admin's: without it the tab would have no child
              routes at all if this tree were ever built before init runs. */}
          {PLUGIN_TENANTS.tenantsRoutes ?? (
            <Route index element={<UpsellTenants />} />
          )}
        </Route>
      </Route>
    </Route>
  );
}
