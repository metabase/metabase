import { createSelector } from "@reduxjs/toolkit";
import { t } from "ttag";

import { collectionApi } from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  createEntity,
  undo,
  entityCompatibleQuery,
} from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls/collections";
import { CollectionSchema } from "metabase/schema";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type {
  ListCollectionsRequest,
  ListCollectionsTreeRequest,
  Collection,
  CreateCollectionRequest,
  UpdateCollectionRequest,
} from "metabase-types/api";
import type { GetState, ReduxAction, Dispatch } from "metabase-types/store";

import getExpandedCollectionsById from "./getExpandedCollectionsById";
import getInitialCollectionId from "./getInitialCollectionId";
import { getCollectionIcon, getCollectionType } from "./utils";

const listCollectionsTree = (
  entityQuery: ListCollectionsTreeRequest,
  dispatch: Dispatch,
) =>
  entityCompatibleQuery(
    entityQuery,
    dispatch,
    collectionApi.endpoints.listCollectionsTree,
  );

const listCollections = (
  entityQuery: ListCollectionsRequest,
  dispatch: Dispatch,
) =>
  entityCompatibleQuery(
    entityQuery,
    dispatch,
    collectionApi.endpoints.listCollections,
  );

type EntityInCollection = {
  collection?: Collection;
};

type ListParams = {
  tree?: boolean;
} & (ListCollectionsRequest | ListCollectionsTreeRequest);

/**
 * @deprecated use "metabase/api" instead
 */
const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  displayNameOne: t`collection`,
  displayNameMany: t`collections`,

  api: {
    list: async (params: ListParams, dispatch: Dispatch) => {
      const { tree, ...entityQuery } = params;
      return tree
        ? listCollectionsTree(entityQuery, dispatch)
        : listCollections(entityQuery, dispatch);
    },
    get: (entityQuery: { id: number }, options: unknown, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        collectionApi.endpoints.getCollection,
      ),
    create: (entityQuery: CreateCollectionRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        collectionApi.endpoints.createCollection,
      ),
    update: (entityQuery: UpdateCollectionRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        collectionApi.endpoints.updateCollection,
      ),
    delete: () => {
      throw new TypeError("Collections.api.delete is not supported");
    },
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
