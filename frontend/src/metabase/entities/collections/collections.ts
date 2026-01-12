import { createSelector } from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import {
  collectionApi,
  skipToken,
  useGetCollectionQuery,
  useListCollectionsQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import {
  canonicalCollectionId,
  isRootTrashCollection,
} from "metabase/collections/utils";
import {
  createEntity,
  entityCompatibleQuery,
  undo,
} from "metabase/lib/entities";
import { CollectionSchema } from "metabase/schema";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type {
  Collection,
  CreateCollectionRequest,
  DeleteCollectionRequest,
  ListCollectionsRequest,
  ListCollectionsTreeRequest,
  UpdateCollectionRequest,
} from "metabase-types/api";
import type { Dispatch, GetState, ReduxAction } from "metabase-types/store";

import getExpandedCollectionsById from "./getExpandedCollectionsById";
import getInitialCollectionId from "./getInitialCollectionId";
import { getCollectionType } from "./utils";

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

type ListParams = {
  tree?: boolean;
} & (ListCollectionsRequest | ListCollectionsTreeRequest);

/**
 * @deprecated use "metabase/api" instead
 */
export const Collections = createEntity({
  name: "collections",
  path: "/api/collection",
  schema: CollectionSchema,

  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameOne: t`collection`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  displayNameMany: t`collections`,

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery: useGetCollectionQuery,
    }),
    useListQuery,
  },

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
    delete: (entityQuery: DeleteCollectionRequest, dispatch: Dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        collectionApi.endpoints.deleteCollection,
      ),
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
        undo(opts, t`collection`, archived ? t`trashed` : t`restored`),
      ),

    setCollection: (
      { id }: Collection,
      collection: Collection,
      opts: Record<string, unknown>,
    ) =>
      Collections.actions.update(
        { id },
        {
          parent_id: canonicalCollectionId(collection?.id),
          archived: isRootTrashCollection(collection),
        },
        undo(opts, "collection", "moved"),
      ),
  },

  objectSelectors: {
    getName: (collection?: Collection) => collection?.name,
  },

  selectors: {
    getExpandedCollectionsById: createSelector(
      [
        (state) => Collections.selectors.getList(state),
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

function useListQuery(
  params: ListParams | undefined,
  options: Parameters<
    typeof useListCollectionsTreeQuery | typeof useListCollectionsQuery
  >[1],
) {
  const collectionsTree = useListCollectionsTreeQuery(
    params?.tree ? _.omit(params, "tree") : skipToken,
    options,
  );

  const collections = useListCollectionsQuery(
    params?.tree ? skipToken : params,
    options,
  );

  return params?.tree ? collectionsTree : collections;
}

export { getExpandedCollectionsById, useListQuery };
