import { PermissionsBasePath } from "metabase/admin/permissions/components/PermissionsBasePath";
import { Outlet } from "metabase/router";
import * as Urls from "metabase/urls";

/**
 * The admin permissions editor, mounted a second time under the hub. Admin
 * permissions does not change.
 *
 * The tab set is whatever the admin editor already has — five when tenants are
 * on — rather than a narrowed copy, so there is no forked component to keep in
 * sync.
 */
export function EmbeddingHubPermissionsPage() {
  return (
    <PermissionsBasePath basePath={Urls.embeddingHubPermissions()}>
      <Outlet />
    </PermissionsBasePath>
  );
}
