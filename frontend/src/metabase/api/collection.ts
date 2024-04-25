import type {
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
  UpdateCollectionRequest,
  Collection,
  CreateCollectionRequest,
  ListCollectionsRequest,
  ListCollectionsTreeRequest,
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
    listCollections: builder.query<Collection[], ListCollectionsRequest>({
      query: ({ ...body }) => ({
        method: "GET",
        url: `/api/collection`,
        body,
      }),
      providesTags: collections =>
        collections ? provideCollectionListTags(collections) : [],
    }),
    listCollectionsTree: builder.query<
      Collection[],
      ListCollectionsTreeRequest
    >({
      query: () => ({
        method: "GET",
        url: "/api/collection/tree",
      }),
    }),
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
    getCollection: builder.query<Collection, { id: number | "root" }>({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/collection/${id}`,
        body,
      }),
      providesTags: collection =>
        collection ? provideCollectionTags(collection) : [],
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
    updateCollection: builder.mutation<Collection, UpdateCollectionRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/collection/${id}`,
        body,
      }),
    }),
  }),
});

export const {
  useListCollectionsQuery,
  useListCollectionsTreeQuery,
  useListCollectionItemsQuery,
  useGetCollectionQuery,
  useCreateCollectionMutation,
  useUpdateCollectionMutation,
} = collectionApi;
