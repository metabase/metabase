import { provideCollectionItemListTags } from "metabase/api/tags";
import type {
  ListStaleCollectionItemsRequest,
  ListStaleCollectionItemsResponse,
} from "metabase-enterprise/clean_up/types";

import { EnterpriseApi } from "./api";

export const collectionApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    listStaleCollectionItems: builder.query<
      ListStaleCollectionItemsResponse,
      ListStaleCollectionItemsRequest
    >({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: `/api/ee/collection/${id}/stale`,
        params,
      }),
      providesTags: response =>
        provideCollectionItemListTags(response?.data ?? [], [
          "card",
          "dashboard",
        ]),
    }),
  }),
});

export const { useListStaleCollectionItemsQuery } = collectionApi;
