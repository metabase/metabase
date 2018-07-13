/* @flow weak */

import { createEntity, undo } from "metabase/lib/entities";
import colors from "metabase/lib/colors";
import { CollectionSchema } from "metabase/schema";
import { createSelector } from "reselect";

import { getUser } from "metabase/selectors/user";

import { t } from "c-3po";

const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Collections.actions.update(
        { id },
        { archived },
        undo(opts, "collection", archived ? "archived" : "unarchived"),
      ),

    setCollection: ({ id }, collection, opts) =>
      Collections.actions.update(
        { id },
        { parent_id: canonicalCollectionId(collection && collection.id) },
        undo(opts, "collection", "moved"),
      ),
  },

  selectors: {
    getExpandedCollectionsById: createSelector(
      [
        state => state.entities.collections,
        state => state.entities.collections_list[null] || [],
        getUser,
      ],
      (collections, collectionsIds, user) =>
        getExpandedCollectionsById(
          collectionsIds.map(id => collections[id]),
          user && user.personal_collection_id,
        ),
    ),
  },

  objectSelectors: {
    getName: collection => collection && collection.name,
    getUrl: collection =>
      collection &&
      (collection.id === "root" ? `/` : `/collection/${collection.id}`),
    getIcon: collection => "all",
  },

  form: {
    fields: (
      values = {
        color: colors.brand,
      },
    ) => [
      {
        name: "name",
        placeholder: "My new fantastic collection",
        validate: name =>
          (!name && t`Name is required`) ||
          (name.length > 100 && t`Name must be 100 characters or less`),
      },
      {
        name: "description",
        type: "text",
        placeholder: "It's optional but oh, so helpful",
        normalize: description => description || null, // expected to be nil or non-empty string
      },
      {
        name: "color",
        type: "hidden",
        initial: () => colors.brand,
        validate: color => !color && t`Color is required`,
      },
      {
        name: "parent_id",
        title: "Parent collection",
        type: "collection",
      },
    ],
  },
});

export default Collections;

// API requires items in "root" collection be persisted with a "null" collection ID
// Also ensure it's parsed as a number
export const canonicalCollectionId = collectionId =>
  collectionId == null || collectionId === "root"
    ? null
    : parseInt(collectionId, 10);

export const ROOT_COLLECTION = {
  id: "root",
  name: t`Our analytics`,
  location: "",
  path: [],
};

// the user's personal collection
export const PERSONAL_COLLECTION = {
  id: undefined, // to be filled in by getExpandedCollectionsById
  name: t`My personal collection`,
  location: "/",
  path: ["root"],
  can_edit: true,
};

// fake collection for admins that contains all other user's collections
export const PERSONAL_COLLECTIONS = {
  id: "personal", // placeholder id
  name: t`Personal Collections`,
  location: "/",
  path: ["root"],
  can_edit: false,
};

// given list of collections with { id, name, location } returns a map of ids to
// expanded collection objects like { id, name, location, path, children }
// including a root collection
function getExpandedCollectionsById(collections, userPersonalCollectionId) {
  const collectionsById = {};
  for (const c of collections) {
    collectionsById[c.id] = {
      ...c,
      path:
        c.id === "root"
          ? []
          : c.location != null
            ? ["root", ...c.location.split("/").filter(l => l)]
            : null,
      children: [],
    };
  }

  // "Our Analytics"
  collectionsById[ROOT_COLLECTION.id] = {
    ...ROOT_COLLECTION,
    parent: null,
    children: [],
    ...(collectionsById[ROOT_COLLECTION.id] || {}),
  };

  // "My personal collection"
  if (userPersonalCollectionId != null) {
    collectionsById[ROOT_COLLECTION.id].children.push({
      ...PERSONAL_COLLECTION,
      id: userPersonalCollectionId,
      parent: collectionsById[ROOT_COLLECTION.id],
      children: [],
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
  for (const { id } of collections) {
    const c = collectionsById[id];
    if (c.path) {
      let parent;
      // move personal collections into PERSONAL_COLLECTIONS fake collection
      if (c.personal_owner_id != null) {
        parent = PERSONAL_COLLECTIONS.id;
      } else if (c.path[c.path.length - 1]) {
        parent = c.path[c.path.length - 1];
      } else {
        parent = ROOT_COLLECTION.id;
      }

      c.parent = collectionsById[parent];
      // need to ensure the parent collection exists, it may have been filtered
      // because we're selecting a collection's parent collection and it can't
      // contain itself
      if (collectionsById[parent]) {
        collectionsById[parent].children.push(c);
      }
    }
  }

  // remove PERSONAL_COLLECTIONS collection if there are none
  if (collectionsById[PERSONAL_COLLECTIONS.id].children.length === 0) {
    delete collectionsById[PERSONAL_COLLECTIONS.id];
  }

  return collectionsById;
}
