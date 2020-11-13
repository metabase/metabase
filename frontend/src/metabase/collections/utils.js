import { t } from "ttag"

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
