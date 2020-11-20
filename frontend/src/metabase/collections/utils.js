import { t } from "ttag";
import _ from "underscore";

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

/* return an array of IDs representing the path to a nested collection */
export function getParentPath(collections, id, visited = []) {
  const v = visited;
  // loop through our current list of collections
  for (const c in collections) {
    const col = collections[c];
    // mark the current one as visited
    v.push(col.id);
    // if we haven't found the id yet and there are children, check those
    if (c.id !== id && col.children) {
      getParentPath(col.children, id, v);
    } else {
      v.pop();
    }
  }
  return v;
}
