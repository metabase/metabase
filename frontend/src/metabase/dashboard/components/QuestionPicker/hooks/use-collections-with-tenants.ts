import { useMemo } from "react";

import { skipToken, useListCollectionsTreeQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks/use-setting";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import getExpandedCollectionsById from "metabase/entities/collections/getExpandedCollectionsById";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { Collection, CollectionId } from "metabase-types/api";

export const SHARED_TENANT_COLLECTIONS_ROOT_ID =
  "shared-tenant-collections-root" as CollectionId;

/**
 * When tenants are enabled, fetches shared tenant collections and merges them
 * into the collectionsById map so they appear as a top-level browsable entry.
 */
export function useCollectionsWithTenants(
  baseCollectionsById: Record<CollectionId, Collection>,
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
      return baseCollectionsById;
    }

    const sharedCollectionsById: Record<CollectionId, any> =
      getExpandedCollectionsById(
        sharedTenantCollections,
        userPersonalCollectionId,
      );

    const sharedRoot = sharedCollectionsById[ROOT_COLLECTION.id];

    const syntheticSharedRoot = {
      ...sharedRoot,
      id: SHARED_TENANT_COLLECTIONS_ROOT_ID,
      name: PLUGIN_TENANTS.getNamespaceDisplayName(
        PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
      ),
      path: [ROOT_COLLECTION.id],
      parent: baseCollectionsById[ROOT_COLLECTION.id],
      children: sharedRoot?.children ?? [],
    };

    // Re-parent children so their parent points to the synthetic root
    for (const child of syntheticSharedRoot.children) {
      child.parent = syntheticSharedRoot;
    }

    // Also merge all shared collections into the map for navigation
    const merged: Record<CollectionId, any> = { ...baseCollectionsById };
    for (const [id, col] of Object.entries(sharedCollectionsById)) {
      if (id !== String(ROOT_COLLECTION.id)) {
        // Rewrite path: replace "root" prefix with "root" > synthetic shared root
        // so breadcrumbs show "Our analytics > Shared collections > ..."
        const fixedPath = col.path
          ? [
              ROOT_COLLECTION.id,
              SHARED_TENANT_COLLECTIONS_ROOT_ID,
              ...col.path.filter(
                (segment: CollectionId) => segment !== ROOT_COLLECTION.id,
              ),
            ]
          : null;

        merged[id as CollectionId] = {
          ...col,
          path: fixedPath,
          // Fix parent references: if parent was the shared root, point to synthetic root
          parent:
            col.parent?.id === ROOT_COLLECTION.id
              ? syntheticSharedRoot
              : col.parent,
        };
      }
    }

    merged[SHARED_TENANT_COLLECTIONS_ROOT_ID] = syntheticSharedRoot;

    // Add shared collections entry to root's children
    const rootCollection = merged[ROOT_COLLECTION.id];
    if (rootCollection) {
      merged[ROOT_COLLECTION.id] = {
        ...rootCollection,
        children: [...(rootCollection.children ?? []), syntheticSharedRoot],
      };
    }

    return merged;
  }, [
    isTenantsActive,
    sharedTenantCollections,
    baseCollectionsById,
    userPersonalCollectionId,
  ]);
}
