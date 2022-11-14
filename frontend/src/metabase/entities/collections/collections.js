import { t } from "ttag";
import { createSelector } from "reselect";

import { GET } from "metabase/lib/api";
import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";

import { CollectionSchema } from "metabase/schema";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

import { canonicalCollectionId } from "metabase/collections/utils";

import { getFormSelector } from "./forms";
import getExpandedCollectionsById from "./getExpandedCollectionsById";
import getInitialCollectionId from "./getInitialCollectionId";
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
      params?.tree
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

    delete: null,
  },

  objectSelectors: {
    getName: collection => collection?.name,
    getUrl: collection => Urls.collection(collection),
    getIcon: (collection, opts) => {
      const wrappedCollection = collection.collection;
      return getCollectionIcon(wrappedCollection || collection, opts);
    },
  },

  selectors: {
    getForm: getFormSelector,
    getExpandedCollectionsById: createSelector(
      [state => state.entities.collections || {}, getUserPersonalCollectionId],
      (collections, currentUserPersonalCollectionId) =>
        getExpandedCollectionsById(
          Object.values(collections),
          currentUserPersonalCollectionId,
        ),
    ),
    getInitialCollectionId,
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.parent_id, getState());
    return type && `collection=${type}`;
  },
});

export { getExpandedCollectionsById };

export default Collections;
