import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getUserTenantCollectionId } from "embedding-sdk-bundle/store/collections";
import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionItemsQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { getUserPersonalCollectionId } from "metabase/current-user";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { isNotNull } from "metabase/utils/types";
import type { Collection, CollectionItem } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export type AllCollectionsItem = CollectionItem &
  Pick<Collection, "is_personal">;

type UseAllCollectionsItemsResult = {
  items: AllCollectionsItem[];
  isLoading: boolean;
  error: unknown;
};

const EMPTY_COLLECTIONS: Collection[] = [];

/**
 * "Our analytics" has the id "root", but the table needs a number. Real
 * collection ids start at 1, so -1 stands in for it and the caller maps it back.
 */
const ROOT_ITEM_ID = -1;

/**
 * Maps the id back to "root" for the virtual root collection, so the host app
 * and the navigation don't get the fake id.
 */
export const withRealCollectionId = (item: CollectionItem) => ({
  ...item,
  id: item.id === ROOT_ITEM_ID ? ROOT_COLLECTION.id : item.id,
});

/**
 * The rows of the virtual "All collections" root: "Our analytics", the shared
 * tenant collections, the tenant collection and the personal one, as siblings.
 */
export const useAllCollectionsItems = ({
  enabled,
}: {
  enabled: boolean;
}): UseAllCollectionsItemsResult => {
  const personalCollectionId = useSdkSelector(getUserPersonalCollectionId);
  const tenantCollectionId = useSdkSelector(getUserTenantCollectionId);

  const {
    data: rootCollection,
    error: rootCollectionError,
    isFetching: isFetchingRootCollection,
  } = useGetCollectionQuery(enabled ? { id: "root" } : skipToken);

  const isRootForbidden =
    isObject(rootCollectionError) && rootCollectionError.status === 403;

  const isRootReadable =
    !isFetchingRootCollection && !rootCollectionError && !!rootCollection;

  // The user may have no permission on "Our analytics" but still have it on
  // sub collections. /root/items returns those, /root would just 403.
  const {
    data: rootItems,
    error: rootItemsError,
    isFetching: isFetchingRootItems,
  } = useListCollectionItemsQuery(
    isRootForbidden ? { id: "root", models: ["collection"] } : skipToken,
  );

  const hasTenantsSetting = useSetting("use-tenants");
  const isTenantsActive =
    enabled && hasTenantsSetting && PLUGIN_TENANTS.isEnabled;

  const {
    data: sharedTenantCollections = EMPTY_COLLECTIONS,
    error: sharedTenantCollectionsError,
    isFetching: isFetchingSharedTenantCollections,
  } = useListCollectionsTreeQuery(
    isTenantsActive
      ? {
          namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
          "exclude-archived": true,
          shallow: true,
        }
      : skipToken,
  );

  // Either "Our analytics" itself, or the collections inside it the user can reach.
  const sharedCollectionItems: AllCollectionsItem[] = isRootReadable
    ? [
        {
          id: ROOT_ITEM_ID,
          model: "collection",
          name: rootCollection.name || t`Our analytics`,
          description: rootCollection.description ?? null,
        },
      ]
    : (rootItems?.data ?? []);

  // Shared tenant collections always have numeric ids; the check only narrows
  // `Collection["id"]` for the table item.
  const sharedTenantCollectionItems: AllCollectionsItem[] =
    sharedTenantCollections.flatMap(({ children, ...collection }) =>
      typeof collection.id === "number"
        ? [
            {
              ...collection,
              id: collection.id,
              // `Collection` also allows "", which `CollectionItem` does not.
              entity_id: collection.entity_id || undefined,
              model: "collection" as const,
              description: collection.description ?? null,
            },
          ]
        : [],
    );

  // The backend excludes tenant-specific root collections from
  // `/api/collection/root/items`, so the tenant collection has to be added here.
  const tenantCollectionItem: AllCollectionsItem | null =
    typeof tenantCollectionId === "number"
      ? {
          id: tenantCollectionId,
          model: "collection",
          name: t`Our data`,
          description: null,
        }
      : null;

  const personalCollectionItem: AllCollectionsItem | null =
    typeof personalCollectionId === "number"
      ? {
          id: personalCollectionId,
          model: "collection",
          name: t`Your personal collection`,
          description: null,
          is_personal: true,
          location: "/",
        }
      : null;

  // Same order the entity picker lists its roots in.
  const items = [
    ...sharedCollectionItems,
    ...sharedTenantCollectionItems,
    tenantCollectionItem,
    personalCollectionItem,
  ].filter(isNotNull);

  // When the user comes back to the virtual root, the rejected root query
  // refetches. RTK still returns the error, so keep the cached rows up, not the
  // loader.
  const isLoadingRows = isRootForbidden
    ? isFetchingRootItems && !rootItems
    : isFetchingRootCollection;

  return {
    items,
    isLoading: isLoadingRows || isFetchingSharedTenantCollections,
    error:
      (isRootForbidden ? rootItemsError : rootCollectionError) ??
      sharedTenantCollectionsError,
  };
};
