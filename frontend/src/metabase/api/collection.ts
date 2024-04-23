import type {
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
  Collection,
  CollectionRequest,
  ListCollectionsRequest,
  ListCollectionsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideCollectionItemListTags,
  provideCollectionTags,
  provideCollectionListTags,
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
  }),
});

export const {
  useListCollectionItemsQuery,
  useListCollectionsQuery,
  useGetCollectionQuery,
} = collectionApi;
