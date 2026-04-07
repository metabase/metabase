import { useMemo } from "react";

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

/**
 * When tenants are enabled, fetches shared tenant collections and merges them
 * into the collectionsById map so they appear as a top-level browsable entry.
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
 * inserting a synthetic "Shared collections" root under Our analytics.
 */
export function mergeSharedCollections(
  baseCollectionsById: Record<CollectionId, Collection>,
  sharedCollectionsById: Record<CollectionId, ExpandedCollectionNode>,
  displayName: string,
): Record<CollectionId, Collection> {
  const sharedRoot = sharedCollectionsById[ROOT_COLLECTION.id];

  const syntheticRoot: ExpandedCollectionNode = {
    ...sharedRoot,
    id: SHARED_TENANT_COLLECTIONS_ROOT_ID,
    name: displayName,
    path: [ROOT_COLLECTION.id],
    parent: baseCollectionsById[ROOT_COLLECTION.id] as ExpandedCollectionNode,
    children: (sharedRoot?.children ?? []).map((child) => ({
      ...child,
      parent: null,
    })) as ExpandedCollectionNode[],
  };

  // Fix circular parent reference now that syntheticRoot exists
  syntheticRoot.children = syntheticRoot.children.map((child) => ({
    ...child,
    parent: syntheticRoot,
  })) as ExpandedCollectionNode[];

  const mergedCollectionsById = { ...baseCollectionsById };

  for (const [id, collection] of Object.entries(sharedCollectionsById)) {
    if (id === String(ROOT_COLLECTION.id)) {
      continue;
    }

    mergedCollectionsById[id as CollectionId] = {
      ...collection,

      // Rewrite path so breadcrumbs show "Our analytics > Shared collections > ..."
      path: collection.path
        ? [
            ROOT_COLLECTION.id,
            SHARED_TENANT_COLLECTIONS_ROOT_ID,
            ...collection.path.filter((s) => s !== ROOT_COLLECTION.id),
          ]
        : null,

      parent:
        collection.parent?.id === ROOT_COLLECTION.id
          ? syntheticRoot
          : collection.parent,
    } as ExpandedCollectionNode;
  }

  mergedCollectionsById[SHARED_TENANT_COLLECTIONS_ROOT_ID] = syntheticRoot;

  // Append synthetic root to Our analytics children
  const rootCollection = mergedCollectionsById[ROOT_COLLECTION.id];

  if (rootCollection) {
    const children = rootCollection.children ?? [];

    mergedCollectionsById[ROOT_COLLECTION.id] = {
      ...rootCollection,
      children: [...children, syntheticRoot],
    } as ExpandedCollectionNode;
  }

  return mergedCollectionsById;
}
