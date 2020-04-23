/* @flow */

import { createEntity, undo } from "metabase/lib/entities";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { CollectionSchema } from "metabase/schema";
import { createSelector } from "reselect";

import {
  getUser,
  getUserDefaultCollectionId,
  getUserPersonalCollectionId,
} from "metabase/selectors/user";

import { t } from "ttag";

const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  displayNameOne: t`collection`,
  displayNameMany: t`collections`,

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

    // NOTE: DELETE not currently implemented
    // $FlowFixMe: no official way to disable builtin actions yet
    delete: null,
  },

  objectSelectors: {
    getName: collection => collection && collection.name,
    getUrl: collection => Urls.collection(collection.id),
    getIcon: collection => "all",
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
    getInitialCollectionId: createSelector(
      [
        // these are listed in order of priority
        (state, { collectionId }) => collectionId,
        (state, { params }) => (params ? params.collectionId : undefined),
        (state, { location }) =>
          location && location.query ? location.query.collectionId : undefined,
        getUserDefaultCollectionId,
      ],
      (...collectionIds) => {
        for (const collectionId of collectionIds) {
          if (collectionId !== undefined) {
            return canonicalCollectionId(collectionId);
          }
        }
        return null;
      },
    ),
  },

  form: {
    fields: (
      values = {
        color: color("brand"),
      },
    ) => [
      {
        name: "name",
        title: t`Name`,
        placeholder: t`My new fantastic collection`,
        validate: name =>
          (!name && t`Name is required`) ||
          (name && name.length > 100 && t`Name must be 100 characters or less`),
      },
      {
        name: "description",
        title: t`Description`,
        type: "text",
        placeholder: t`It's optional but oh, so helpful`,
        normalize: description => description || null, // expected to be nil or non-empty string
      },
      {
        name: "color",
        title: t`Color`,
        type: "hidden",
        initial: () => color("brand"),
        validate: color => !color && t`Color is required`,
      },
      {
        name: "parent_id",
        title: t`Collection it's saved in`,
        type: "collection",
      },
    ],
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.parent_id, getState());
    return type && `collection=${type}`;
  },
});

export default Collections;

// API requires items in "root" collection be persisted with a "null" collection ID
// Also ensure it's parsed as a number
export const canonicalCollectionId = (
  collectionId: PseudoCollectionId,
): CollectionId | null =>
  collectionId == null || collectionId === "root"
    ? null
    : parseInt(collectionId, 10);

export const getCollectionType = (collectionId: string, state: {}) =>
  collectionId === null || collectionId === "root"
    ? "root"
    : collectionId === getUserPersonalCollectionId(state)
    ? "personal"
    : collectionId !== undefined
    ? "other"
    : null;

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
  can_write: true,
};

// fake collection for admins that contains all other user's collections
export const PERSONAL_COLLECTIONS = {
  id: "personal", // placeholder id
  name: t`All personal collections`,
  location: "/",
  path: ["root"],
  can_write: false,
};

type UserId = number;

// a "real" collection
type CollectionId = number;

type Collection = {
  id: CollectionId,
  location?: string,
  personal_owner_id?: UserId,
};

// includes "root" and "personal" pseudo collection IDs
type PseudoCollectionId = CollectionId | "root" | "personal";

type ExpandedCollection = {
  id: PseudoCollectionId,
  path: ?(string[]),
  parent: ?ExpandedCollection,
  children: ExpandedCollection[],
  is_personal?: boolean,
};

// given list of collections with { id, name, location } returns a map of ids to
// expanded collection objects like { id, name, location, path, children }
// including a root collection
function getExpandedCollectionsById(
  collections: Collection[],
  userPersonalCollectionId: ?CollectionId,
): { [key: PseudoCollectionId]: ExpandedCollection } {
  const collectionsById: { [key: PseudoCollectionId]: ExpandedCollection } = {};
  for (const c of collections) {
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
      is_personal: c.personal_owner_id != null,
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
      is_personal: true,
    });
  }

  // "Personal Collections"
  collectionsById[PERSONAL_COLLECTIONS.id] = {
    ...PERSONAL_COLLECTIONS,
    parent: collectionsById[ROOT_COLLECTION.id],
    children: [],
    is_personal: true,
  };
  collectionsById[ROOT_COLLECTION.id].children.push(
    collectionsById[PERSONAL_COLLECTIONS.id],
  );

  // iterate over original collections so we don't include ROOT_COLLECTION as
  // a child of itself
  for (const { id } of collections) {
    const c = collectionsById[id];
    // don't add root as parent of itself
    if (c.path && c.id !== ROOT_COLLECTION.id) {
      let parentId;
      // move personal collections into PERSONAL_COLLECTIONS fake collection
      if (c.personal_owner_id != null) {
        parentId = PERSONAL_COLLECTIONS.id;
      } else if (c.path[c.path.length - 1]) {
        parentId = c.path[c.path.length - 1];
      } else {
        parentId = ROOT_COLLECTION.id;
      }

      // $FlowFixMe
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
