import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useListCollectionsTreeQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks/use-setting";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import getExpandedCollectionsById from "metabase/entities/collections/getExpandedCollectionsById";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { Collection, CollectionId } from "metabase-types/api";

// getExpandedCollectionsById produces path as CollectionId[] at runtime,
// but ExpandedCollection types it as string, so we use a corrected type.
export type ExpandedCollectionNode = Collection & {
  path: CollectionId[] | null;
  parent: Collection | null;
  children: Collection[];
  is_personal?: boolean;
};

export const SHARED_TENANT_COLLECTIONS_ROOT_ID =
  "shared-tenant-collections-root" as CollectionId;

export const COLLECTIONS_TOP_LEVEL_ID = "collections-top-level" as CollectionId;

/**
 * When tenants are enabled, fetches shared tenant collections and merges them
 * into the collectionsById map so they appear as a top-level browsable entry.
 *
 * The tree structure becomes:
 *   Collections (top level)
 *   ├── Our analytics (root collection)
 *   └── Shared collections (synthetic root for shared collections)
 *       ├── Shared collection A
 *       └── Shared collection B
 */
export function useCollectionsWithTenants(
  collectionsById: Record<CollectionId, Collection>,
): Record<CollectionId, Collection> {
  const useTenants = useSetting("use-tenants");
  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);
  const isTenantsActive = useTenants && PLUGIN_TENANTS.isEnabled;

  const { data: sharedTenantCollections } = useListCollectionsTreeQuery(
    isTenantsActive
      ? {
          namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE ?? undefined,
          "exclude-archived": true,
        }
      : skipToken,
  );

  return useMemo(() => {
    if (!isTenantsActive || !sharedTenantCollections?.length) {
      return collectionsById;
    }

    const sharedCollectionsById = getExpandedCollectionsById(
      sharedTenantCollections,
      userPersonalCollectionId,
    ) as Record<CollectionId, ExpandedCollectionNode>;

    const displayName =
      PLUGIN_TENANTS.getNamespaceDisplayName(
        PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
      ) ?? "";

    return mergeSharedCollections(
      collectionsById,
      sharedCollectionsById,
      displayName,
    );
  }, [
    isTenantsActive,
    sharedTenantCollections,
    collectionsById,
    userPersonalCollectionId,
  ]);
}

/**
 * Merge shared tenant collections into the base collections map,
 * creating a top-level "Collections" node that contains both
 * "Our analytics" and "Shared collections" as siblings.
 */
export function mergeSharedCollections(
  baseCollectionsById: Record<CollectionId, Collection>,
  sharedCollectionsById: Record<CollectionId, ExpandedCollectionNode>,
  displayName: string,
): Record<CollectionId, Collection> {
  const sharedRoot = sharedCollectionsById[ROOT_COLLECTION.id];
  const rootCollection = baseCollectionsById[
    ROOT_COLLECTION.id
  ] as ExpandedCollectionNode;

  // Create the top-level "Collections" node that parents both namespaces
  const topLevel = {
    ...rootCollection,
    id: COLLECTIONS_TOP_LEVEL_ID,
    name: t`Collections`,
    path: [],
    parent: null,
    children: [],
  } as ExpandedCollectionNode;

  // Create the shared collections synthetic root as a sibling of Our analytics
  const sharedSyntheticRoot: ExpandedCollectionNode = {
    ...sharedRoot,
    id: SHARED_TENANT_COLLECTIONS_ROOT_ID,
    name: displayName,
    path: [COLLECTIONS_TOP_LEVEL_ID],
    parent: topLevel,
    children: (sharedRoot?.children ?? []).map((child) => ({
      ...child,
      parent: null,
    })) as ExpandedCollectionNode[],
  };

  // Fix circular parent reference now that sharedSyntheticRoot exists
  sharedSyntheticRoot.children = sharedSyntheticRoot.children.map((child) => ({
    ...child,
    parent: sharedSyntheticRoot,
  })) as ExpandedCollectionNode[];

  // Wire up the top-level children
  topLevel.children = [rootCollection, sharedSyntheticRoot];

  const mergedCollectionsById = { ...baseCollectionsById };

  // Rewrite root collection to point to top-level parent
  mergedCollectionsById[ROOT_COLLECTION.id] = {
    ...rootCollection,
    path: [COLLECTIONS_TOP_LEVEL_ID],
    parent: topLevel,
  } as ExpandedCollectionNode;

  // Merge shared collections with rewritten paths
  for (const [id, collection] of Object.entries(sharedCollectionsById)) {
    if (id === String(ROOT_COLLECTION.id)) {
      continue;
    }

    mergedCollectionsById[id as CollectionId] = {
      ...collection,

      // Rewrite path: Collections > Shared collections > ...
      path: collection.path
        ? [
            COLLECTIONS_TOP_LEVEL_ID,
            SHARED_TENANT_COLLECTIONS_ROOT_ID,
            ...collection.path.filter((s) => s !== ROOT_COLLECTION.id),
          ]
        : null,

      parent:
        collection.parent?.id === ROOT_COLLECTION.id
          ? sharedSyntheticRoot
          : collection.parent,
    } as ExpandedCollectionNode;
  }

  mergedCollectionsById[SHARED_TENANT_COLLECTIONS_ROOT_ID] =
    sharedSyntheticRoot;
  mergedCollectionsById[COLLECTIONS_TOP_LEVEL_ID] = topLevel;

  return mergedCollectionsById;
}
