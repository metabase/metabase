import { t } from "ttag";

import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { ExpandedCollection } from "metabase/redux/store";
import type { Collection, CollectionId } from "metabase-types/api";

import {
  COLLECTIONS_TOP_LEVEL_ID,
  SHARED_TENANT_COLLECTIONS_ROOT_ID,
  TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
  createSyntheticTopLevel,
  mergeBaseCollectionsAtTopLevel,
  mergeCollectionNamespaceChildren,
} from "./tenant-collection-tree";

/**
 * Collection trees used to construct the question picker for tenant-aware users.
 */
interface TenantCollectionTrees {
  baseCollectionsById: Record<CollectionId, ExpandedCollection>;
  sharedCollectionsById: Record<CollectionId, ExpandedCollection>;
  tenantSpecificCollectionsById: Record<CollectionId, ExpandedCollection>;
}

/**
 * Input to populate the question picker's synthetic root
 * for non-tenant users, including admins.
 */
interface MergeTenantCollectionsArgs extends TenantCollectionTrees {
  sharedCollectionsName: string;
  tenantCollectionNamesById?: ReadonlyMap<CollectionId, string>;
}

/**
 * Represents the synthetic `Collections` root for tenant-aware users.
 */
interface TenantCollectionSyntheticRoot {
  id: CollectionId;
  name: string;
  namespace: Collection["namespace"];
  collectionNamesById?: ReadonlyMap<CollectionId, string>;
}

/**
 * Adds one synthetic collection under the synthetic `Collections` root.
 *
 * Collections/
 *   Shared collections/  # adds this collection
 *     Finance/
 *
 * Updates the collection path and parent links for this new hierarchy.
 * Returns `null` when the namespace has no collections.
 */
function addSyntheticCollectionToRoot({
  topLevel,
  syntheticRoot: { id, name, namespace, collectionNamesById },
  collectionsById,
  namespaceCollectionsById,
}: {
  topLevel: ExpandedCollection;
  syntheticRoot: TenantCollectionSyntheticRoot;
  collectionsById: Record<CollectionId, ExpandedCollection>;
  namespaceCollectionsById: Record<CollectionId, ExpandedCollection>;
}): ExpandedCollection | null {
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

  const children = mergeCollectionNamespaceChildren({
    collectionsById,
    namespaceCollectionsById,
    parent: syntheticRoot,
    pathPrefix: [COLLECTIONS_TOP_LEVEL_ID, syntheticRoot.id],
    getCollectionName: (collection) =>
      collectionNamesById?.get(collection.id) ?? collection.name,
  });

  if (children.length === 0) {
    return null;
  }

  syntheticRoot.children = children;

  return syntheticRoot;
}

/**
 * Builds the question picker tree for admins and other non-tenant users.
 *
 * It adds synthetic shared collections and tenant-specific collections to the tree.
 */
export function mergeTenantCollections({
  baseCollectionsById,
  sharedCollectionsById,
  tenantSpecificCollectionsById,
  sharedCollectionsName,
  tenantCollectionNamesById,
}: MergeTenantCollectionsArgs): Record<CollectionId, ExpandedCollection> {
  const syntheticTopLevel = createSyntheticTopLevel();
  const mergedCollectionsById = { ...baseCollectionsById };

  const mergedRoot = mergeBaseCollectionsAtTopLevel({
    baseCollectionsById,
    mergedCollectionsById,
    syntheticTopLevel,
  });

  const sharedSyntheticRoot = addSyntheticCollectionToRoot({
    collectionsById: mergedCollectionsById,
    namespaceCollectionsById: sharedCollectionsById,
    topLevel: syntheticTopLevel,
    syntheticRoot: {
      id: SHARED_TENANT_COLLECTIONS_ROOT_ID,
      name: sharedCollectionsName,
      namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
    },
  });

  const tenantSpecificSyntheticRoot = addSyntheticCollectionToRoot({
    collectionsById: mergedCollectionsById,
    namespaceCollectionsById: tenantSpecificCollectionsById,
    topLevel: syntheticTopLevel,
    syntheticRoot: {
      id: TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
      name: t`Tenant collections`,
      namespace: PLUGIN_TENANTS.TENANT_SPECIFIC_NAMESPACE,
      collectionNamesById: tenantCollectionNamesById,
    },
  });

  syntheticTopLevel.children = [
    mergedRoot,
    sharedSyntheticRoot,
    tenantSpecificSyntheticRoot,
  ].filter(
    (collection): collection is ExpandedCollection => collection != null,
  );

  for (const syntheticRoot of [
    sharedSyntheticRoot,
    tenantSpecificSyntheticRoot,
  ]) {
    if (syntheticRoot) {
      mergedCollectionsById[syntheticRoot.id] = syntheticRoot;
    }
  }

  mergedCollectionsById[COLLECTIONS_TOP_LEVEL_ID] = syntheticTopLevel;

  return mergedCollectionsById;
}

/**
 * Builds the question-picker tree for tenant users,
 * who uses full-app embedding or uses the internal app:
 *
 * Collections/
 *   Our data/   # tenant collection
 *   Finance/    # shared collection
 *
 * This assumes that the tenant user has access to dashboard creation.
 * An admin or internal user will never see this tree.
 */
export function mergeTenantUserCollections({
  baseCollectionsById,
  sharedCollectionsById,
  tenantSpecificCollectionsById,
}: TenantCollectionTrees): Record<CollectionId, ExpandedCollection> {
  const syntheticTopLevel = createSyntheticTopLevel();
  const mergedCollectionsById = { ...baseCollectionsById };

  const tenantCollections = mergeCollectionNamespaceChildren({
    collectionsById: mergedCollectionsById,
    namespaceCollectionsById: tenantSpecificCollectionsById,
    parent: syntheticTopLevel,
    pathPrefix: [COLLECTIONS_TOP_LEVEL_ID],
    getCollectionName: () => t`Our data`,
  });

  const sharedCollections = mergeCollectionNamespaceChildren({
    collectionsById: mergedCollectionsById,
    namespaceCollectionsById: sharedCollectionsById,
    parent: syntheticTopLevel,
    pathPrefix: [COLLECTIONS_TOP_LEVEL_ID],
  });

  const rootCollection = baseCollectionsById[ROOT_COLLECTION.id];

  const mergedRoot = mergeBaseCollectionsAtTopLevel({
    baseCollectionsById,
    mergedCollectionsById,
    syntheticTopLevel,
    shouldIncludeRoot: rootCollection.children.length > 0,
  });

  syntheticTopLevel.children = [
    ...tenantCollections,
    ...sharedCollections,
    ...(mergedRoot ? [mergedRoot] : []),
  ];

  mergedCollectionsById[COLLECTIONS_TOP_LEVEL_ID] = syntheticTopLevel;

  return mergedCollectionsById;
}
