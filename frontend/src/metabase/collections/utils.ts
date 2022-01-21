import { t } from "ttag";
import { canonicalCollectionId } from "metabase/entities/collections";

export type Item = {
  name: string;
  description: string | null;
  collection_position?: number | null;
  id: number;
  getIcon: () => { name: string };
  getUrl: () => string;
  setArchived: (isArchived: boolean) => void;
  setPinned: (isPinned: boolean) => void;
  copy?: boolean;
  setCollection?: boolean;
  model: string;
};

type CollectionId = "root" | number;

export type Collection = {
  id: CollectionId;
  can_write: boolean;
  name: string;
  archived: boolean;
  personal_owner_id?: number | unknown;
  children?: Collection[];
  originalName?: string;
  effective_ancestors?: Collection[];
  location?: string;
};

export function nonPersonalOrArchivedCollection(
  collection: Collection,
): boolean {
  // @TODO - should this be an API thing?
  return !isPersonalCollection(collection) && !collection.archived;
}

export function isPersonalCollection(collection: Collection): boolean {
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

export function getParentPath(
  collections: Collection[],
  targetId: CollectionId,
): CollectionId[] | null {
  if (collections.length === 0) {
    return null; // not found!
  }

  for (const collection of collections) {
    if (collection.id === targetId) {
      return [collection.id]; // we found it!
    }
    if (collection.children) {
      const path = getParentPath(collection.children, targetId);
      if (path !== null) {
        // we found it under this collection
        return [collection.id, ...path];
      }
    }
  }
  return null; // didn't find it under any collection
}

function getNonRootParentId(collection: Collection) {
  if (Array.isArray(collection.effective_ancestors)) {
    // eslint-disable-next-line no-unused-vars
    const [root, nonRootParent] = collection.effective_ancestors;
    return nonRootParent ? nonRootParent.id : undefined;
  }
  // location is a string like "/1/4" where numbers are parent collection IDs
  const nonRootParentId = collection.location?.split("/")?.[0];
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

export function isRootCollection(collection: Collection): boolean {
  return collection.id === "root";
}

export function isItemPinned(item: Item) {
  return item.collection_position != null;
}
