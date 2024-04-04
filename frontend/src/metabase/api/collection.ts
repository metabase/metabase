import type {
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";

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
    }),
  }),
});

export const { useListCollectionItemsQuery } = collectionApi;
