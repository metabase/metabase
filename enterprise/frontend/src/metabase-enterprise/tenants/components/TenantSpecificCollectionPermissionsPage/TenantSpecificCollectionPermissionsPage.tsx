import { CollectionPermissionsPageContent } from "metabase/admin/permissions/components/CollectionPermissionsPageContent";
import type { Collection, CollectionId } from "metabase-types/api";

import {
  getTenantSpecificCollectionEntity,
  getTenantSpecificCollectionsPermissionEditor,
  getTenantSpecificCollectionsSidebar,
  tenantSpecificCollectionsQuery,
} from "./utils";

const getSidebar = (
  _collections: Collection[],
  collectionId: CollectionId | undefined,
) => getTenantSpecificCollectionsSidebar(collectionId);

const getShouldPropagateToChildren = () => true;

export function TenantSpecificCollectionPermissionsPage() {
  return (
    <CollectionPermissionsPageContent
      tab="tenant-specific-collections"
      collectionsQuery={tenantSpecificCollectionsQuery}
      getSidebar={getSidebar}
      getCollection={getTenantSpecificCollectionEntity}
      getPermissionEditor={getTenantSpecificCollectionsPermissionEditor}
      getShouldPropagateToChildren={getShouldPropagateToChildren}
    />
  );
}
