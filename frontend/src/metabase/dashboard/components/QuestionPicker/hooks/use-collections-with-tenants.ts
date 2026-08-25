import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useListCollectionsTreeQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import getExpandedCollectionsById from "metabase/common/collections/getExpandedCollectionsById";
import {
  getIsTenantUser,
  getUserPersonalCollectionId,
} from "metabase/current-user";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { ExpandedCollection } from "metabase/redux/store";
import { useSetting } from "metabase/settings";
import type { Collection, CollectionId } from "metabase-types/api";

export const SHARED_TENANT_COLLECTIONS_ROOT_ID: CollectionId =
  "shared-tenant-collections-root";

export const TENANT_SPECIFIC_COLLECTIONS_ROOT_ID: CollectionId =
  "tenant-specific-collections-root";

export const COLLECTIONS_TOP_LEVEL_ID: CollectionId = "collections-top-level";

type TenantCollectionNamespace = {
  id: CollectionId;
  name: string;
  namespace: Collection["namespace"];
  collectionNamesById?: ReadonlyMap<CollectionId, string>;
};

/**
 * When tenants are enabled, fetches tenant collections and adds their
 * namespaces as top-level browsable entries.
 *
 * The tree structure becomes:
 *   Collections (top level)
 *   ├── Our analytics (root collection)
 *   ├── Shared collections (synthetic root for shared collections)
 *       ├── Shared collection A
 *       └── Shared collection B
 *   └── Tenant collections (synthetic root for tenant-specific collections)
 *       ├── Tenant collection A
 *       └── Tenant collection B
 */
export function useCollectionsWithTenants(
  collectionsById: Record<CollectionId, ExpandedCollection>,
): Record<CollectionId, ExpandedCollection> {
  const useTenants = useSetting("use-tenants");
  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);
  const isTenantUser = useSelector(getIsTenantUser);
  const isTenantsActive = useTenants && PLUGIN_TENANTS.isEnabled;

  const { data: sharedTenantCollections } = useListCollectionsTreeQuery(
    isTenantsActive
      ? {
          namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
          "exclude-archived": true,
        }
      : skipToken,
  );

  const { data: tenantSpecificCollections } = useListCollectionsTreeQuery(
    isTenantsActive
      ? {
          namespace: PLUGIN_TENANTS.TENANT_SPECIFIC_NAMESPACE,
          "exclude-archived": true,
        }
      : skipToken,
  );

  const { data: tenants } = PLUGIN_TENANTS.useListActiveTenants({
    skip: !isTenantsActive || isTenantUser,
  });

  const tenantCollectionNamesById = useMemo(
    () =>
      new Map(
        tenants?.flatMap(({ tenant_collection_id, name }) =>
          tenant_collection_id == null ? [] : [[tenant_collection_id, name]],
        ),
      ),
    [tenants],
  );

  return useMemo(() => {
    if (!isTenantsActive) {
      return collectionsById;
    }

    const sharedCollectionsById = sharedTenantCollections?.length
      ? getExpandedCollectionsById(
          flattenCollectionTree(sharedTenantCollections),
          userPersonalCollectionId,
        )
      : {};

    const tenantSpecificCollectionsById = tenantSpecificCollections?.length
      ? getExpandedCollectionsById(
          flattenCollectionTree(tenantSpecificCollections),
          userPersonalCollectionId,
        )
      : {};

    if (
      Object.keys(sharedCollectionsById).length === 0 &&
      Object.keys(tenantSpecificCollectionsById).length === 0
    ) {
      return collectionsById;
    }

    const displayName =
      PLUGIN_TENANTS.getNamespaceDisplayName(
        PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
      ) ?? t`Shared collections`;

    return mergeTenantCollections(
      collectionsById,
      sharedCollectionsById,
      tenantSpecificCollectionsById,
      displayName,
      tenantCollectionNamesById,
    );
  }, [
    isTenantsActive,
    sharedTenantCollections,
    tenantSpecificCollections,
    tenantCollectionNamesById,
    collectionsById,
    userPersonalCollectionId,
  ]);
}

/**
 * Flatten the nested collection tree into a flat collection list.
 */
export const flattenCollectionTree = (
  collections: Collection[],
): Collection[] =>
  collections.flatMap((collection) => [
    collection,
    ...flattenCollectionTree(collection.children ?? []),
  ]);

function mergeTenantCollectionNamespace(
  collectionsById: Record<CollectionId, ExpandedCollection>,
  namespaceCollectionsById: Record<CollectionId, ExpandedCollection>,
  topLevel: ExpandedCollection,
  { id, name, namespace, collectionNamesById }: TenantCollectionNamespace,
): ExpandedCollection | null {
  const namespaceRoot = namespaceCollectionsById[ROOT_COLLECTION.id];
  if (!namespaceRoot?.children.length) {
    return null;
  }

  const syntheticRoot: ExpandedCollection = {
    id,
    name,
    description: null,
    can_write: false,
    can_restore: false,
    can_delete: false,
    namespace,
    location: null,
    path: [COLLECTIONS_TOP_LEVEL_ID],
    parent: topLevel,
    children: [],
  };

  const directCollectionIds = new Set(
    namespaceRoot.children.map((collection) => collection.id),
  );

  for (const collection of namespaceRoot.children) {
    const mergedCollection = {
      ...collection,
      name: collectionNamesById?.get(collection.id) ?? collection.name,
      path: [COLLECTIONS_TOP_LEVEL_ID, syntheticRoot.id],
      parent: syntheticRoot,
    };

    syntheticRoot.children.push(mergedCollection);
    collectionsById[collection.id] = mergedCollection;
  }

  for (const collection of Object.values(namespaceCollectionsById)) {
    if (
      collection.id === ROOT_COLLECTION.id ||
      directCollectionIds.has(collection.id)
    ) {
      continue;
    }

    collectionsById[collection.id] = {
      ...collection,
      path: collection.path
        ? [
            COLLECTIONS_TOP_LEVEL_ID,
            syntheticRoot.id,
            ...collection.path.filter(
              (pathId) => pathId !== ROOT_COLLECTION.id,
            ),
          ]
        : null,
      parent: collection.parent
        ? (collectionsById[collection.parent.id] ?? collection.parent)
        : null,
    };
  }

  return syntheticRoot;
}

/**
 * Merge shared and tenant-specific collections into separate roots beneath
 * the top-level "Collections" node.
 */
export function mergeTenantCollections(
  baseCollectionsById: Record<CollectionId, ExpandedCollection>,
  sharedCollectionsById: Record<CollectionId, ExpandedCollection>,
  tenantSpecificCollectionsById: Record<CollectionId, ExpandedCollection>,
  sharedCollectionsName: string,
  tenantCollectionNamesById?: ReadonlyMap<CollectionId, string>,
): Record<CollectionId, ExpandedCollection> {
  const rootCollection = baseCollectionsById[ROOT_COLLECTION.id];
  const syntheticTopLevel: ExpandedCollection = {
    id: COLLECTIONS_TOP_LEVEL_ID,
    name: t`Collections`,
    description: null,
    can_write: false,
    can_restore: false,
    can_delete: false,
    namespace: null,
    location: null,
    path: [],
    parent: null,
    children: [],
  };
  const mergedCollectionsById = { ...baseCollectionsById };

  mergedCollectionsById[ROOT_COLLECTION.id] = {
    ...rootCollection,
    path: [COLLECTIONS_TOP_LEVEL_ID],
    parent: syntheticTopLevel,
  };

  for (const collection of Object.values(baseCollectionsById)) {
    if (collection.id === ROOT_COLLECTION.id || !collection.path) {
      continue;
    }

    mergedCollectionsById[collection.id] = {
      ...collection,
      path: [COLLECTIONS_TOP_LEVEL_ID, ...collection.path],
    };
  }

  const sharedSyntheticRoot = mergeTenantCollectionNamespace(
    mergedCollectionsById,
    sharedCollectionsById,
    syntheticTopLevel,
    {
      id: SHARED_TENANT_COLLECTIONS_ROOT_ID,
      name: sharedCollectionsName,
      namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
    },
  );

  const tenantSpecificSyntheticRoot = mergeTenantCollectionNamespace(
    mergedCollectionsById,
    tenantSpecificCollectionsById,
    syntheticTopLevel,
    {
      id: TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
      name: t`Tenant collections`,
      namespace: PLUGIN_TENANTS.TENANT_SPECIFIC_NAMESPACE,
      collectionNamesById: tenantCollectionNamesById,
    },
  );

  syntheticTopLevel.children = [
    mergedCollectionsById[ROOT_COLLECTION.id],
    sharedSyntheticRoot,
    tenantSpecificSyntheticRoot,
  ].filter(
    (collection): collection is ExpandedCollection => collection != null,
  );

  if (sharedSyntheticRoot) {
    mergedCollectionsById[SHARED_TENANT_COLLECTIONS_ROOT_ID] =
      sharedSyntheticRoot;
  }

  if (tenantSpecificSyntheticRoot) {
    mergedCollectionsById[TENANT_SPECIFIC_COLLECTIONS_ROOT_ID] =
      tenantSpecificSyntheticRoot;
  }

  mergedCollectionsById[COLLECTIONS_TOP_LEVEL_ID] = syntheticTopLevel;

  return mergedCollectionsById;
}
