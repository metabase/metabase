import { t } from "ttag";
import { isNotNull } from "metabase/lib/types";
import type {
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";

export function nonPersonalOrArchivedCollection(
  collection: Collection,
): boolean {
  // @TODO - should this be an API thing?
  return !isRootPersonalCollection(collection) && !collection.archived;
}

export function isRootPersonalCollection(
  collection: Partial<Collection> | CollectionItem,
): boolean {
  return typeof collection.personal_owner_id === "number";
}

export function isPersonalCollection(
  collection: Pick<Collection, "is_personal">,
) {
  return collection.is_personal;
}

export function isPublicCollection(
  collection: Pick<Collection, "is_personal">,
) {
  return !isPersonalCollection(collection);
}

export function isInstanceAnalyticsCollection(
  collection: Partial<Collection>,
): boolean {
  return (
    collection &&
    PLUGIN_COLLECTIONS.getCollectionType(collection).type ===
      "instance-analytics"
  );
}

export function getInstanceAnalyticsCustomCollection(
  collections: Collection[],
): Collection | null {
  return PLUGIN_COLLECTIONS.getInstanceAnalyticsCustomCollection(collections);
}

export function isInstanceAnalyticsCustomCollection(
  collection: Collection,
): boolean {
  return (
    PLUGIN_COLLECTIONS.CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID ===
    collection.entity_id
  );
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

function getNonRootParentId(collection: Collection) {
  if (Array.isArray(collection.effective_ancestors)) {
    const [, nonRootParent] = collection.effective_ancestors;
    return nonRootParent ? nonRootParent.id : undefined;
  }
  // location is a string like "/1/4" where numbers are parent collection IDs
  const nonRootParentId = collection.location?.split("/")?.[1];
  return canonicalCollectionId(nonRootParentId);
}

export function isPersonalCollectionChild(
  collection: Collection,
  collectionList: Collection[],
): boolean {
  const nonRootParentId = getNonRootParentId(collection);
  if (!nonRootParentId) {
    return false;
  }
  const parentCollection = collectionList.find(c => c.id === nonRootParentId);
  return Boolean(parentCollection && !!parentCollection.personal_owner_id);
}

export function isPersonalCollectionOrChild(
  collection: Collection,
  collectionList: Collection[],
): boolean {
  return (
    isRootPersonalCollection(collection) ||
    isPersonalCollectionChild(collection, collectionList)
  );
}

export function isRootCollection(collection: Pick<Collection, "id">): boolean {
  return canonicalCollectionId(collection?.id) === null;
}

export function isItemPinned(item: CollectionItem) {
  return item.collection_position != null;
}

export function isItemQuestion(item: CollectionItem) {
  return item.model === "card";
}

export function isItemModel(item: CollectionItem) {
  return item.model === "dataset";
}

export function isItemCollection(item: CollectionItem) {
  return item.model === "collection";
}

export function isReadOnlyCollection(collection: CollectionItem) {
  return isItemCollection(collection) && !collection.can_write;
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
    !isReadOnlyCollection(item) &&
    item.setCollection != null &&
    !(isItemCollection(item) && isRootPersonalCollection(item))
  );
}

export function canArchiveItem(item: CollectionItem, collection: Collection) {
  return (
    collection.can_write &&
    !isReadOnlyCollection(item) &&
    !(isItemCollection(item) && isRootPersonalCollection(item))
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
  if (
    collectionId === "root" ||
    collectionId === null ||
    collectionId === undefined
  ) {
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
    isRootPersonalCollection(collection) ||
    isPersonalCollectionChild(collection, collections)
  );
}

export function canManageCollectionAuthorityLevel(
  collection: Partial<Collection>,
  collectionMap: Partial<Record<CollectionId, Collection>>,
) {
  if (isRootPersonalCollection(collection)) {
    return false;
  }
  const parentId = coerceCollectionId(collection.parent_id);
  const parentCollection = collectionMap[parentId];
  const collections = Object.values(collectionMap).filter(isNotNull);
  return (
    parentCollection &&
    !isPersonalOrPersonalChild(parentCollection, collections)
  );
}
