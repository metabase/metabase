import { CollectionPermissionsPageContent } from "metabase/admin/permissions/components/CollectionPermissionsPageContent";

import {
  getTenantSpecificCollectionEntity,
  getTenantSpecificCollectionsPermissionEditor,
  getTenantSpecificCollectionsSidebar,
  tenantSpecificCollectionsQuery,
} from "./utils";

export function TenantSpecificCollectionPermissionsPage() {
  return (
    <CollectionPermissionsPageContent
      tab="tenant-specific-collections"
      collectionsQuery={tenantSpecificCollectionsQuery}
      getSidebar={getTenantSpecificCollectionsSidebar}
      getCollection={getTenantSpecificCollectionEntity}
      getPermissionEditor={getTenantSpecificCollectionsPermissionEditor}
    />
  );
}
