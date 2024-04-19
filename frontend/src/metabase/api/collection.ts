import type {
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { provideCollectionItemListTags } from "./tags";

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
  }),
});

export const { useListCollectionItemsQuery } = collectionApi;
