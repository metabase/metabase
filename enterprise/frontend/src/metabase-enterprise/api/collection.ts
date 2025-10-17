import { provideCollectionItemListTags } from "metabase/api/tags";
import type {
  BulkArchiveStaleItemsRequest,
  BulkArchiveStaleItemsResponse,
  BulkUnarchiveItemsRequest,
  BulkUnarchiveItemsResponse,
  ListStaleCollectionItemsRequest,
  ListStaleCollectionItemsResponse,
} from "metabase-enterprise/clean_up/types";

import { EnterpriseApi } from "./api";

export const collectionApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listStaleCollectionItems: builder.query<
      ListStaleCollectionItemsResponse,
      ListStaleCollectionItemsRequest
    >({
      query: ({ id: collectionId, ...params }) => ({
        method: "GET",
        url: `/api/ee/stale/${collectionId}`,
        params,
      }),
      providesTags: (response) =>
        provideCollectionItemListTags(response?.data ?? [], [
          "card",
          "dashboard",
        ]),
    }),
    bulkArchiveStaleItems: builder.mutation<
      BulkArchiveStaleItemsResponse,
      BulkArchiveStaleItemsRequest
    >({
      query: ({ id: collectionId, ...params }) => ({
        method: "POST",
        url: `/api/ee/stale/${collectionId}/archive`,
        body: params,
      }),
      invalidatesTags: ["card", "dashboard", "collection"],
    }),
    bulkUnarchiveItems: builder.mutation<
      BulkUnarchiveItemsResponse,
      BulkUnarchiveItemsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/stale/unarchive`,
        body,
      }),
      invalidatesTags: ["card", "dashboard", "collection"],
    }),
  }),
});

export const {
  useListStaleCollectionItemsQuery,
  useBulkArchiveStaleItemsMutation,
  useBulkUnarchiveItemsMutation,
} = collectionApi;
