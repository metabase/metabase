import { t } from "ttag";

import {
  canPlaceEntityInCollection as canPlaceEntityInCollectionImpl,
  canPlaceEntityInCollectionOrDescendants as canPlaceEntityInCollectionOrDescendantsImpl,
  getLibraryCollectionType,
} from "metabase/data-studio/utils";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import {
  type CardType,
  type Collection,
  type CollectionEssentials,
  type CollectionId,
  type CollectionItem,
  type CollectionItemModel,
  type CollectionType,
  type User,
  isBaseEntityID,
} from "metabase-types/api";

export type EntityType = CollectionItemModel;

export function getEntityTypeFromCardType(cardType: CardType): EntityType {
  switch (cardType) {
    case "question":
      return "card";
    case "model":
      return "dataset";
    case "metric":
      return "metric";
  }
}

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

export function isDedicatedTenantCollectionRoot(
  collection: Partial<Collection> | CollectionItem,
): boolean {
  return collection.type === "tenant-specific-root-collection";
}

export function isDedicatedTenantCollectionOfUser({
  user,
  collection,
}: {
  user: User;
  collection: Collection;
}): boolean {
  return (
    user.tenant_collection_id !== null &&
    user.tenant_collection_id === collection.id
  );
}

export function isPersonalCollection(
  collection: Pick<Collection, "is_personal">,
) {
  return collection.is_personal;
}

export function isRootTrashCollection(
  collection?: Pick<Collection, "type">,
): boolean {
  return collection?.type === "trash";
}

export function isTrashedCollection(
  collection: Pick<Collection, "type" | "archived">,
): boolean {
  return isRootTrashCollection(collection) || !!collection.archived;
}

export function isPublicCollection(
  collection: Pick<Collection, "is_personal">,
) {
  return !isPersonalCollection(collection);
}

export function isEditableCollection(
  collection: Collection,
  { currentUser }: { currentUser: User },
) {
  return (
    collection.can_write &&
    !isRootCollection(collection) &&
    !isRootPersonalCollection(collection) &&
    !isTrashedCollection(collection) &&
    !isLibraryCollection(collection) &&
    !isDedicatedTenantCollectionOfUser({ user: currentUser, collection })
  );
}

export function isInstanceAnalyticsCollection(
  collection?: Pick<Collection, "type">,
): boolean {
  return (
    !!collection &&
    PLUGIN_COLLECTIONS.getCollectionType(collection).type ===
      "instance-analytics"
  );
}

export function isInstanceAnalyticsCustomCollection(
  collection: Collection,
): boolean {
  return (
    PLUGIN_COLLECTIONS.CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID ===
    collection.entity_id
  );
}

export function isSyncedCollection(collection: Partial<Collection>): boolean {
  return PLUGIN_COLLECTIONS.isSyncedCollection(collection);
}

export function isLibraryCollection(
  collection: Pick<Collection, "type">,
): boolean {
  return getLibraryCollectionType(collection.type) != null;
}

export function isExamplesCollection(collection: Collection): boolean {
  return !!collection.is_sample && collection.name === "Examples";
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
    .filter((l) => l.personal_owner_id === userID)
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
  const parentCollection = collectionList.find((c) => c.id === nonRootParentId);
  return Boolean(parentCollection && !!parentCollection.personal_owner_id);
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

export function isItemMetric(item: CollectionItem) {
  return item.model === "metric";
}

export function isItemCollection(item: Pick<CollectionItem, "model">) {
  return item.model === "collection";
}

export function isReadOnlyCollection(collection: CollectionItem) {
  return isItemCollection(collection) && !collection.can_write;
}

export function canBookmarkItem({ model, type, archived }: CollectionItem) {
  if (archived) {
    return false;
  }

  if (type === "question" || type === "model" || type === "metric") {
    return true;
  }

  switch (model) {
    case "table":
      return false;
    case "collection":
      return !isLibraryCollection({ type });
    default:
      return true;
  }
}

export function canPinItem(item: CollectionItem, collection?: Collection) {
  return collection?.can_write && item.setPinned != null && !item.archived;
}

export function canPreviewItem(item: CollectionItem, collection?: Collection) {
  return (
    collection?.can_write &&
    isItemPinned(item) &&
    (isItemQuestion(item) || isItemMetric(item)) &&
    !item.archived
  );
}

export function canMoveItem(item: CollectionItem, collection?: Collection) {
  return (
    (collection?.can_write || isRootTrashCollection(collection)) &&
    !isReadOnlyCollection(item) &&
    item.setCollection != null &&
    !(isItemCollection(item) && isRootPersonalCollection(item)) &&
    !isLibraryCollection(item as Pick<Collection, "type">)
  );
}

export function canArchiveItem(item: CollectionItem, collection?: Collection) {
  return (
    collection?.can_write &&
    !isReadOnlyCollection(item) &&
    !(
      isItemCollection(item) &&
      (isRootPersonalCollection(item) || isDedicatedTenantCollectionRoot(item))
    ) &&
    !isLibraryCollection(item as Pick<Collection, "type">) &&
    item.model !== "table" &&
    !item.archived
  );
}

export function canCopyItem(item: CollectionItem) {
  return item.copy && !item.archived;
}

export function canPlaceEntityInCollection(
  entityType: EntityType,
  collectionType: CollectionType | null | undefined,
): boolean {
  return canPlaceEntityInCollectionImpl(entityType, collectionType);
}

export function canPlaceEntityInCollectionOrDescendants(
  entityType: EntityType,
  collectionType: CollectionType | null | undefined,
): boolean {
  return canPlaceEntityInCollectionOrDescendantsImpl(
    entityType,
    collectionType,
  );
}

export function isPreviewShown(item: CollectionItem) {
  return isPreviewEnabled(item) && isFullyParameterized(item);
}

export function isPreviewEnabled(item: CollectionItem) {
  return item.collection_preview ?? true;
}

export function isFullyParameterized(item: CollectionItem) {
  return item.fully_parameterized ?? true;
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
    collectionId === "tenant" ||
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

export function canonicalCollectionIdOrEntityId(
  collectionId: string | number | null | undefined,
): number | string | null {
  if (isBaseEntityID(collectionId)) {
    return collectionId;
  }

  return canonicalCollectionId(collectionId);
}

export function isValidCollectionId(
  collectionId: unknown,
): collectionId is CollectionId {
  if (
    typeof collectionId !== "string" &&
    typeof collectionId !== "number" &&
    collectionId !== null &&
    collectionId !== undefined
  ) {
    return false;
  }
  const id = canonicalCollectionId(collectionId);
  return id === null || typeof id === "number";
}

export const getCollectionName = (
  collection: Pick<Collection, "id" | "name">,
) => {
  if (isRootCollection(collection)) {
    return t`Our analytics`;
  }
  return collection?.name || t`Untitled collection`;
};

export const getCollectionPath = (collection: CollectionEssentials) => {
  const ancestors: CollectionEssentials[] =
    collection.effective_ancestors || [];
  const collections = ancestors.concat(collection);
  return collections;
};

export const getCollectionPathAsString = (collection: CollectionEssentials) => {
  const collections = getCollectionPath(collection);
  return collections
    .map((coll) => getCollectionName(coll))
    .join(` ${collectionPathSeparator} `);
};

export const collectionPathSeparator = "/";
