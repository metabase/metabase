import { CollectionPermissionsPageContent } from "metabase/admin/permissions/components/CollectionPermissionsPageContent";

import {
  getTenantCollectionEntity,
  getTenantCollectionsPermissionEditor,
  getTenantCollectionsSidebar,
  tenantCollectionsQuery,
} from "./utils";

const getShouldPropagateToChildren = (toggleState: boolean | null) =>
  toggleState || null;

export function TenantCollectionPermissionsPage() {
  return (
    <CollectionPermissionsPageContent
      tab="tenant-collections"
      collectionsQuery={tenantCollectionsQuery}
      getSidebar={getTenantCollectionsSidebar}
      getCollection={getTenantCollectionEntity}
      getPermissionEditor={getTenantCollectionsPermissionEditor}
      getShouldPropagateToChildren={getShouldPropagateToChildren}
    />
  );
}
