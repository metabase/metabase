import type {
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { collectionItemListTags } from "./tags";

export const collectionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listCollectionItems: builder.query<
      ListCollectionItemsResponse,
      ListCollectionItemsRequest
    >({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/collection/${id}/items`,
        body,
      }),
      providesTags: (response, error, { models }) =>
        collectionItemListTags(response?.data ?? [], models),
    }),
  }),
});

export const { useListCollectionItemsQuery } = collectionApi;
