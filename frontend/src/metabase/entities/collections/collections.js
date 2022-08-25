import _ from "underscore";
import { createEntity, undo } from "metabase/lib/entities";

import * as Urls from "metabase/lib/urls";

import { CollectionSchema } from "metabase/schema";
import { createSelector } from "reselect";

import { GET } from "metabase/lib/api";

import { getUser, getUserPersonalCollectionId } from "metabase/selectors/user";
import { canonicalCollectionId } from "metabase/collections/utils";

import { t } from "ttag";

import {
  ROOT_COLLECTION,
  PERSONAL_COLLECTION,
  PERSONAL_COLLECTIONS,
} from "./constants";
import { getFormSelector } from "./forms";
import { getCollectionIcon, getCollectionType } from "./utils";

const listCollectionsTree = GET("/api/collection/tree");
const listCollections = GET("/api/collection");

const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  displayNameOne: t`collection`,
  displayNameMany: t`collections`,

  api: {
    list: async (params, ...args) =>
      /* Parts of the UI, like ItemPicker don't yet know about the /tree endpoint and break if it's used,
      so choose which endpoint to use based on the presence of a "tree" param
      */
      params && params.tree
        ? listCollectionsTree(params, ...args)
        : listCollections(params, ...args),
  },

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
    delete: null,
  },

  objectSelectors: {
    getName: collection => collection && collection.name,
    getUrl: collection => Urls.collection(collection),
    getIcon: (collection, opts) => {
      const wrappedCollection = collection.collection;
      return getCollectionIcon(wrappedCollection || collection, opts);
    },
  },

  selectors: {
    getForm: getFormSelector,
    getExpandedCollectionsById: createSelector(
      [
        state => state.entities.collections,
        state => {
          const { list } = state.entities.collections_list[null] || {};
          return list || [];
        },
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
        state => state.entities.collections,
        getUserPersonalCollectionId,

        // these are listed in order of priority
        byCollectionIdProp,
        byCollectionIdNavParam,
        byCollectionUrlId,
        byCollectionQueryParameter,
      ],
      (collections, personalId, ...collectionIds) => {
        const allCollectionIds = [
          ...collectionIds,
          ROOT_COLLECTION.id,
          personalId,
        ];

        for (const collectionId of allCollectionIds) {
          const collection = collections[collectionId];
          if (collection && collection.can_write) {
            return canonicalCollectionId(collectionId);
          }
        }

        const rootCollection = collections[ROOT_COLLECTION.id];

        return rootCollection?.can_write
          ? canonicalCollectionId(ROOT_COLLECTION.id)
          : canonicalCollectionId(personalId);
      },
    ),
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.parent_id, getState());
    return type && `collection=${type}`;
  },
});

export default Collections;

// a "real" collection

// includes "root" and "personal" pseudo collection IDs

// given list of collections with { id, name, location } returns a map of ids to
// expanded collection objects like { id, name, location, path, children }
// including a root collection
export function getExpandedCollectionsById(
  collections,
  userPersonalCollectionId,
) {
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
      parent: null,
      children: [],
      is_personal: c.personal_owner_id != null,
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
  if (userPersonalCollectionId != null) {
    const personalCollection = collectionsById[userPersonalCollectionId];
    collectionsById[ROOT_COLLECTION.id].children.push({
      ...PERSONAL_COLLECTION,
      id: userPersonalCollectionId,
      parent: collectionsById[ROOT_COLLECTION.id],
      children: personalCollection?.children || [],
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

// Initial collection ID selector helpers

/**
 * @param {ReduxState} state
 * @param {{collectionId?: number}} props
 * @returns {number | undefined}
 */
function byCollectionIdProp(state, { collectionId }) {
  return collectionId;
}

/**
 * @param {ReduxState} state
 * @param {params?: {collectionId?: number}} props
 * @returns {number | undefined}
 */
function byCollectionIdNavParam(state, { params }) {
  return params && params.collectionId;
}

/**
 * Extracts ID from collection URL slugs
 *
 * Example: /collection/14-marketing —> 14
 *
 * @param {ReduxState} state
 * @param {params?: {slug?: string}, location?: {pathname?: string}} props
 * @returns {number | undefined}
 */
function byCollectionUrlId(state, { params, location }) {
  const isCollectionPath =
    params &&
    params.slug &&
    location &&
    Urls.isCollectionPath(location.pathname);
  return isCollectionPath && Urls.extractCollectionId(params.slug);
}

/**
 * Extracts collection ID from query params
 *
 * Example: /some-route?collectionId=14 —> 14
 *
 * @param {ReduxState} state
 * @param {location?: {query?: {collectionId?: number}}} props
 * @returns {number | undefined}
 */
function byCollectionQueryParameter(state, { location }) {
  return location && location.query && location.query.collectionId;
}
