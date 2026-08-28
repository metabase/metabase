import { t } from "ttag";

import { ROOT_COLLECTION } from "metabase/collections/constants";
import type { Collection, CollectionId } from "metabase-types/api";

export type ExpandedCollection = Omit<
  Collection,
  "children" | "parent" | "path"
> & {
  path: CollectionId[] | null;
  parent: ExpandedCollection | null;
  children: ExpandedCollection[];
  is_personal?: boolean;
};

export const SHARED_TENANT_COLLECTIONS_ROOT_ID: CollectionId =
  "shared-tenant-collections-root";

export const TENANT_SPECIFIC_COLLECTIONS_ROOT_ID: CollectionId =
  "tenant-specific-collections-root";

export const COLLECTIONS_TOP_LEVEL_ID: CollectionId = "collections-top-level";

export const flattenCollectionTree = (
  collections: Collection[],
): Collection[] =>
  collections.flatMap((collection) => [
    collection,
    ...flattenCollectionTree(collection.children ?? []),
  ]);

export const createSyntheticTopLevel = (): ExpandedCollection => ({
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
});

export function mergeCollectionNamespaceChildren({
  collectionsById,
  namespaceCollectionsById,
  parent,
  pathPrefix,
  getCollectionName,
}: {
  collectionsById: Record<CollectionId, ExpandedCollection>;
  namespaceCollectionsById: Record<CollectionId, ExpandedCollection>;
  parent: ExpandedCollection;
  pathPrefix: CollectionId[];
  getCollectionName?: (collection: ExpandedCollection) => string;
}): ExpandedCollection[] {
  const namespaceRoot = namespaceCollectionsById[ROOT_COLLECTION.id];
  if (!namespaceRoot?.children.length) {
    return [];
  }

  const directCollectionIds = new Set(
    namespaceRoot.children.map((collection) => collection.id),
  );

  const directCollections = namespaceRoot.children.map((collection) => {
    const mergedCollection = {
      ...collection,
      name: getCollectionName?.(collection) ?? collection.name,
      path: pathPrefix,
      parent,
    };

    collectionsById[collection.id] = mergedCollection;

    return mergedCollection;
  });

  for (const collection of Object.values(namespaceCollectionsById)) {
    if (
      collection.id === ROOT_COLLECTION.id ||
      directCollectionIds.has(collection.id)
    ) {
      continue;
    }

    const path = collection.path
      ? [
          ...pathPrefix,
          ...collection.path.filter((pathId) => pathId !== ROOT_COLLECTION.id),
        ]
      : null;

    const parent = collection.parent
      ? (collectionsById[collection.parent.id] ?? collection.parent)
      : null;

    collectionsById[collection.id] = { ...collection, path, parent };
  }

  return directCollections;
}

export function mergeBaseCollectionsAtTopLevel({
  baseCollectionsById,
  mergedCollectionsById,
  syntheticTopLevel,
  shouldIncludeRoot = true,
}: {
  baseCollectionsById: Record<CollectionId, ExpandedCollection>;
  mergedCollectionsById: Record<CollectionId, ExpandedCollection>;
  syntheticTopLevel: ExpandedCollection;
  shouldIncludeRoot?: boolean;
}): ExpandedCollection | null {
  if (!shouldIncludeRoot) {
    return null;
  }

  const rootCollection = baseCollectionsById[ROOT_COLLECTION.id];

  const mergedRoot = {
    ...rootCollection,
    path: [COLLECTIONS_TOP_LEVEL_ID],
    parent: syntheticTopLevel,
  };

  mergedCollectionsById[ROOT_COLLECTION.id] = mergedRoot;

  for (const collection of Object.values(baseCollectionsById)) {
    if (collection.id === ROOT_COLLECTION.id || !collection.path) {
      continue;
    }

    mergedCollectionsById[collection.id] = {
      ...collection,
      path: [COLLECTIONS_TOP_LEVEL_ID, ...collection.path],
    };
  }

  return mergedRoot;
}
