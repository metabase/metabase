import type {
  Collection,
  CollectionId,
  CollectionNamespace,
  GroupId,
} from "metabase-types/api";

export type UpdateCollectionPermissionParams = {
  groupId: GroupId;
  collectionId: CollectionId;
  value: string;
  shouldPropagate?: boolean;
  collection?: Collection;
};

export type CollectionPermissionsConfig = {
  // UI Configuration
  tab: "collections" | "tenant-collections";
  navigationBasePath: string;
  sidebarTitle: string;
  rootCollectionName?: string;

  // Collections Query - namespace determines which collections to fetch
  collectionsQuery: {
    namespace?: CollectionNamespace;
    tree?: boolean;
    "exclude-other-user-collections"?: boolean;
    "exclude-archived"?: boolean;
  };

  // Behavior flags
  filterTenantGroupsFromNonTenantCollections: boolean;
  handleInstanceAnalytics: boolean;
};

export type CollectionIdProps = {
  params: { collectionId: CollectionId };
};
