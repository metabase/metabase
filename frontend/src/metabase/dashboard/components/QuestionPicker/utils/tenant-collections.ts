import { t } from "ttag";

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
 * Input to populate the question picker's synthetic collections
 * for non-tenant users, including admins.
 */
interface MergeTenantCollectionsArgs extends TenantCollectionTrees {
  sharedCollectionsName: string;
  tenantCollectionNamesById?: ReadonlyMap<CollectionId, string>;
}

/**
 * Input to populate the question picker for a tenant user.
 */
interface MergeTenantUserCollectionsArgs extends TenantCollectionTrees {
  canReadRootCollection: boolean;
}

/**
 * Describes one synthetic collection below `Collections`.
 */
interface SyntheticCollectionConfig {
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
  syntheticCollection: { id, name, namespace, collectionNamesById },
  collectionsById,
  namespaceCollectionsById,
}: {
  topLevel: ExpandedCollection;
  syntheticCollection: SyntheticCollectionConfig;
  collectionsById: Record<CollectionId, ExpandedCollection>;
  namespaceCollectionsById: Record<CollectionId, ExpandedCollection>;
}): ExpandedCollection | null {
  const syntheticCollection: ExpandedCollection = {
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
    parent: syntheticCollection,
    pathPrefix: [COLLECTIONS_TOP_LEVEL_ID, syntheticCollection.id],
    getCollectionName: (collection) =>
      collectionNamesById?.get(collection.id) ?? collection.name,
  });

  if (children.length === 0) {
    return null;
  }

  syntheticCollection.children = children;

  return syntheticCollection;
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

  const sharedSyntheticCollection = addSyntheticCollectionToRoot({
    collectionsById: mergedCollectionsById,
    namespaceCollectionsById: sharedCollectionsById,
    topLevel: syntheticTopLevel,
    syntheticCollection: {
      id: SHARED_TENANT_COLLECTIONS_ROOT_ID,
      name: sharedCollectionsName,
      namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
    },
  });

  const tenantSpecificSyntheticCollection = addSyntheticCollectionToRoot({
    collectionsById: mergedCollectionsById,
    namespaceCollectionsById: tenantSpecificCollectionsById,
    topLevel: syntheticTopLevel,
    syntheticCollection: {
      id: TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
      name: t`Tenant collections`,
      namespace: PLUGIN_TENANTS.TENANT_SPECIFIC_NAMESPACE,
      collectionNamesById: tenantCollectionNamesById,
    },
  });

  syntheticTopLevel.children = [
    mergedRoot,
    sharedSyntheticCollection,
    tenantSpecificSyntheticCollection,
  ].filter(
    (collection): collection is ExpandedCollection => collection != null,
  );

  for (const syntheticCollection of [
    sharedSyntheticCollection,
    tenantSpecificSyntheticCollection,
  ]) {
    if (syntheticCollection) {
      mergedCollectionsById[syntheticCollection.id] = syntheticCollection;
    }
  }

  mergedCollectionsById[COLLECTIONS_TOP_LEVEL_ID] = syntheticTopLevel;

  return mergedCollectionsById;
}

/**
 * Builds the question picker tree for tenant users,
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
  canReadRootCollection,
}: MergeTenantUserCollectionsArgs): Record<CollectionId, ExpandedCollection> {
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

  const baseCollections = canReadRootCollection
    ? []
    : mergeCollectionNamespaceChildren({
        collectionsById: mergedCollectionsById,
        namespaceCollectionsById: baseCollectionsById,
        parent: syntheticTopLevel,
        pathPrefix: [COLLECTIONS_TOP_LEVEL_ID],
      });

  const mergedRoot = mergeBaseCollectionsAtTopLevel({
    baseCollectionsById,
    mergedCollectionsById,
    syntheticTopLevel,
    // The root can contain questions even when it has no child collections.
    shouldIncludeRoot: canReadRootCollection,
  });

  syntheticTopLevel.children = [
    ...tenantCollections,
    ...sharedCollections,
    ...baseCollections,
    ...(mergedRoot ? [mergedRoot] : []),
  ];

  mergedCollectionsById[COLLECTIONS_TOP_LEVEL_ID] = syntheticTopLevel;

  return mergedCollectionsById;
}
