import type {
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
  Collection,
  CollectionRequest,
  ListCollectionsRequest,
  ListCollectionsResponse,
  CreateCollectionRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideCollectionItemListTags,
  provideCollectionTags,
  provideCollectionListTags,
  invalidateTags,
  listTag,
  idTag,
} from "./tags";

export const collectionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listCollectionItems: builder.query<
      ListCollectionItemsResponse,
      ListCollectionItemsRequest
    >({
      query: ({ id, limit, offset, ...body }) => ({
        method: "GET",
        url: `/api/collection/${id}/items`,
        params: { limit, offset },
        body,
      }),
      providesTags: (response, error, { models }) =>
        provideCollectionItemListTags(response?.data ?? [], models),
    }),
    getCollection: builder.query<Collection, CollectionRequest>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/collection/${id}`,
        body,
      }),
      providesTags: collection =>
        collection ? provideCollectionTags(collection) : [],
    }),
    listCollections: builder.query<
      ListCollectionsResponse,
      ListCollectionsRequest
    >({
      query: ({ ...body }) => ({
        method: "GET",
        url: `/api/collection`,
        body,
      }),
      providesTags: collections =>
        collections ? provideCollectionListTags(collections) : [],
    }),
    createCollection: builder.mutation<Collection, CreateCollectionRequest>({
      query: body => ({
        method: "POST",
        url: "/api/collection",
        body,
      }),
      invalidatesTags: (collection, error) =>
        collection
          ? [
              ...invalidateTags(error, [listTag("collection")]),
              ...invalidateTags(error, [
                idTag("collection", collection.parent_id ?? "root"),
              ]),
            ]
          : [],
    }),
  }),
});

export const {
  useListCollectionItemsQuery,
  useListCollectionsQuery,
  useGetCollectionQuery,
  useCreateCollectionMutation,
} = collectionApi;
