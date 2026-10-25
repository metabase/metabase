import {
  collectionsQuery,
  getCollectionsPermissionEditor,
  getCollectionsSidebar,
  getPermissionsCollection,
} from "metabase/permissions";

import { CollectionPermissionsPageContent } from "../../components/CollectionPermissionsPageContent";

export function CollectionPermissionsPage() {
  return (
    <CollectionPermissionsPageContent
      tab="collections"
      collectionsQuery={collectionsQuery}
      getSidebar={getCollectionsSidebar}
      getCollection={getPermissionsCollection}
      getPermissionEditor={getCollectionsPermissionEditor}
    />
  );
}
