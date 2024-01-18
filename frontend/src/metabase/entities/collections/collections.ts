import { t } from "ttag";
import { createSelector } from "@reduxjs/toolkit";

import { GET } from "metabase/lib/api";
import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls/collections";

import { CollectionSchema } from "metabase/schema";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

import { canonicalCollectionId } from "metabase/collections/utils";

import type { Collection } from "metabase-types/api";
import type { GetState, ReduxAction } from "metabase-types/store";

import getExpandedCollectionsById from "./getExpandedCollectionsById";
import getInitialCollectionId from "./getInitialCollectionId";
import { getCollectionIcon, getCollectionType } from "./utils";

const listCollectionsTree = GET("/api/collection/tree");
const listCollections = GET("/api/collection");

type EntityInCollection = {
  collection?: Collection;
};

const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  displayNameOne: t`collection`,
  displayNameMany: t`collections`,

  api: {
    list: async (params: { tree?: boolean }, ...args: any) =>
      params?.tree
        ? listCollectionsTree(params, ...args)
        : listCollections(params, ...args),
  },

  objectActions: {
    setArchived: (
      { id }: Collection,
      archived: boolean,
      opts: Record<string, unknown>,
    ) =>
      Collections.actions.update(
        { id },
        { archived },
        undo(opts, "collection", archived ? "archived" : "unarchived"),
      ),

    setCollection: (
      { id }: Collection,
      collection: Collection,
      opts: Record<string, unknown>,
    ) =>
      Collections.actions.update(
        { id },
        { parent_id: canonicalCollectionId(collection?.id) },
        undo(opts, "collection", "moved"),
      ),

    delete: null,
  },

  objectSelectors: {
    getName: (collection?: Collection) => collection?.name,
    getUrl: (collection?: Collection) => Urls.collection(collection),
    getIcon: (
      item: Collection | EntityInCollection,
      opts: { tooltip?: string },
    ) => {
      const collection =
        (item as EntityInCollection).collection || (item as Collection);
      return getCollectionIcon(collection, opts);
    },
  },

  selectors: {
    getExpandedCollectionsById: createSelector(
      [
        state => Collections.selectors.getList(state),
        getUserPersonalCollectionId,
        (_state, props) => props?.collectionFilter,
      ],
      (collections, currentUserPersonalCollectionId, collectionFilter) =>
        getExpandedCollectionsById(
          collections || [],
          currentUserPersonalCollectionId,
          collectionFilter,
        ),
    ),
    getInitialCollectionId,
  },

  getAnalyticsMetadata(
    [object]: [Collection],
    { action: _action }: { action: ReduxAction },
    getState: GetState,
  ) {
    const type = object && getCollectionType(object.parent_id, getState());
    return type && `collection=${type}`;
  },
});

export { getExpandedCollectionsById };

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections;
