import type {
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { searchItemListTags } from "./tags";

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
      providesTags: (response, error, { models = [] }) => [
        ...searchItemListTags(
          response?.data ?? [],
          Array.isArray(models) ? models : [models],
        ),
      ],
    }),
  }),
});

export const { useListCollectionItemsQuery } = collectionApi;
