import { t } from "ttag";
import _ from "underscore";

import {
  ROOT_COLLECTION,
  PERSONAL_COLLECTION,
  PERSONAL_COLLECTIONS,
} from "./constants";

// given list of collections with { id, name, location } returns a map of ids to
// expanded collection objects like { id, name, location, path, children }
// including a root collection
function getExpandedCollectionsById(
  collections,
  userPersonalCollectionId,
  collectionFilter = () => true,
) {
  const collectionsById = {};
  const filteredCollections = collections.filter(collectionFilter);
  for (const c of filteredCollections) {
    collectionsById[c.id] = {
      ...c,
      path:
        c.id === "root"
          ? []
          : c.location != null
          ? ["root", ...c.location.split("/").filter(l => l)]
          : null,
      parent: null,
      children: [],
    };
  }

  // "Our Analytics"
  collectionsById[ROOT_COLLECTION.id] = {
    ...ROOT_COLLECTION,
    name: collectionsById[ROOT_COLLECTION.id]
      ? ROOT_COLLECTION.name
      : t`Collections`,
    parent: null,
    children: [],
    ...(collectionsById[ROOT_COLLECTION.id] || {}),
  };

  // "My personal collection"
  if (
    userPersonalCollectionId != null &&
    !!collectionsById[userPersonalCollectionId]
  ) {
    const personalCollection = collectionsById[userPersonalCollectionId];
    collectionsById[ROOT_COLLECTION.id].children.push({
      ...PERSONAL_COLLECTION,
      id: userPersonalCollectionId,
      parent: collectionsById[ROOT_COLLECTION.id],
      children: personalCollection?.children || [],
    });
  }

  // "Personal Collections"
  collectionsById[PERSONAL_COLLECTIONS.id] = {
    ...PERSONAL_COLLECTIONS,
    parent: collectionsById[ROOT_COLLECTION.id],
    children: [],
  };
  collectionsById[ROOT_COLLECTION.id].children.push(
    collectionsById[PERSONAL_COLLECTIONS.id],
  );

  // iterate over original collections so we don't include ROOT_COLLECTION as
  // a child of itself
  for (const { id } of filteredCollections) {
    const c = collectionsById[id];
    // don't add root as parent of itself
    if (c.path && c.id !== ROOT_COLLECTION.id) {
      let parentId;
      // move personal collections into PERSONAL_COLLECTIONS fake collection
      if (c.personal_owner_id != null) {
        parentId = PERSONAL_COLLECTIONS.id;
      } else {
        // Find the closest parent that the user has permissions for
        const parentIdIndex = _.findLastIndex(c.path, p => collectionsById[p]);
        parentId = parentIdIndex >= 0 ? c.path[parentIdIndex] : undefined;
      }
      if (!parentId) {
        parentId = ROOT_COLLECTION.id;
      }

      const parent = parentId == null ? null : collectionsById[parentId];
      c.parent = parent;
      // need to ensure the parent collection exists, it may have been filtered
      // because we're selecting a collection's parent collection and it can't
      // contain itself
      if (parent) {
        parent.children.push(c);
      }
    }
  }

  // remove PERSONAL_COLLECTIONS collection if there are none or just one (the user's own)
  if (collectionsById[PERSONAL_COLLECTIONS.id].children.length <= 1) {
    delete collectionsById[PERSONAL_COLLECTIONS.id];
    collectionsById[ROOT_COLLECTION.id].children = collectionsById[
      ROOT_COLLECTION.id
    ].children.filter(c => c.id !== PERSONAL_COLLECTIONS.id);
  }

  return collectionsById;
}

export default getExpandedCollectionsById;
