import { t } from "ttag";

// return collections that aren't personal and aren't archived
export function nonPersonalCollection(collection) {
  // @TODO - should this be an API thing?
  return !collection.personal_owner_id && !collection.archived;
}

// Replace the name for the current user's collection
// @Question - should we just update the API to do this?
function preparePersonalCollection(c) {
  return {
    ...c,
    name: t`Your personal collection`,
  };
}

// get the top level collection that matches the current user ID
export function currentUserPersonalCollections(collectionList, userID) {
  return collectionList
    .filter(l => l.personal_owner_id === userID)
    .map(preparePersonalCollection);
}

export function getParentPath(collections, targetId) {
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
