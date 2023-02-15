import { t } from "ttag";
import { Collection, CollectionId, CollectionItem } from "metabase-types/api";

export function nonPersonalOrArchivedCollection(
  collection: Collection,
): boolean {
  // @TODO - should this be an API thing?
  return !isPersonalCollection(collection) && !collection.archived;
}

export function isPersonalCollection(collection: Partial<Collection>): boolean {
  return typeof collection.personal_owner_id === "number";
}

// Replace the name for the current user's collection
// @Question - should we just update the API to do this?
function preparePersonalCollection(c: Collection): Collection {
  return {
    ...c,
    name: t`Your personal collection`,
    originalName: c.name,
  };
}

// get the top level collection that matches the current user ID
export function currentUserPersonalCollections(
  collectionList: Collection[],
  userID: number,
): Collection[] {
  return collectionList
    .filter(l => l.personal_owner_id === userID)
    .map(preparePersonalCollection);
}

export function isPersonalCollectionChild(
  collection: Collection,
  collectionList: Collection[],
): boolean {
  if (collection.effective_ancestors) {
    return collection.effective_ancestors.some(c => c.personal_owner_id);
  }

  if (collection.location) {
    // location is a string like "/1/4" where numbers are parent collection IDs
    const parentId = canonicalCollectionId(collection.location.split("/")[0]);
    const parentCollection = collectionList.find(c => c.id === parentId);
    return parentCollection?.personal_owner_id != null;
  }

  return false;
}

export function isRootCollection(collection: Pick<Collection, "id">): boolean {
  return canonicalCollectionId(collection.id) === null;
}

export function isItemPinned(item: CollectionItem) {
  return item.collection_position != null;
}

export function isItemQuestion(item: CollectionItem) {
  return item.model === "card";
}

export function isItemCollection(item: CollectionItem) {
  return item.model === "collection";
}

export function canPinItem(item: CollectionItem, collection: Collection) {
  return collection.can_write && item.setPinned != null;
}

export function canPreviewItem(item: CollectionItem, collection: Collection) {
  return collection.can_write && isItemPinned(item) && isItemQuestion(item);
}

export function canMoveItem(item: CollectionItem, collection: Collection) {
  return (
    collection.can_write &&
    item.setCollection != null &&
    !(isItemCollection(item) && isPersonalCollection(item))
  );
}

export function canArchiveItem(item: CollectionItem, collection: Collection) {
  return (
    collection.can_write &&
    !(isItemCollection(item) && isPersonalCollection(item))
  );
}

export function isPreviewShown(item: CollectionItem) {
  return isPreviewEnabled(item) && isFullyParametrized(item);
}

export function isPreviewEnabled(item: CollectionItem) {
  return item.collection_preview ?? true;
}

export function isFullyParametrized(item: CollectionItem) {
  return item.fully_parametrized ?? true;
}

export function coerceCollectionId(
  collectionId: CollectionId | null | undefined,
): CollectionId {
  return collectionId == null ? "root" : collectionId;
}

// API requires items in "root" collection be persisted with a "null" collection ID
// Also ensure it's parsed as a number
export function canonicalCollectionId(
  collectionId: string | number | null | undefined,
): number | null {
  if (collectionId === "root" || collectionId == null) {
    return null;
  } else if (typeof collectionId === "number") {
    return collectionId;
  } else {
    return parseInt(collectionId, 10);
  }
}

export function isValidCollectionId(
  collectionId: string | number | null | undefined,
): boolean {
  const id = canonicalCollectionId(collectionId);
  return id === null || typeof id === "number";
}

function isPersonalOrPersonalChild(
  collection: Collection,
  collections: Collection[],
) {
  if (!collection) {
    return false;
  }
  return (
    isPersonalCollection(collection) ||
    isPersonalCollectionChild(collection, collections)
  );
}

export function canManageCollectionAuthorityLevel(
  collection: Partial<Collection>,
  collectionMap: Record<CollectionId, Collection>,
) {
  if (isPersonalCollection(collection)) {
    return false;
  }
  const parentId = coerceCollectionId(collection.parent_id);
  const parentCollection = collectionMap[parentId];
  const collections = Object.values(collectionMap);
  return (
    parentCollection &&
    !isPersonalOrPersonalChild(parentCollection, collections)
  );
}
