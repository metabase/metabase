import { trackSearchRequest } from "metabase/search/analytics";
import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const searchApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/search",
        params,
      }),
      providesTags: (response, error, { models }) =>
        provideSearchItemListTags(response?.data ?? [], models),
      onQueryStarted: (args, { queryFulfilled, requestId }) => {
        if (args.context) {
          const start = Date.now();
          return handleQueryFulfilled(queryFulfilled, (data) => {
            const duration = Date.now() - start;
            trackSearchRequest(args, data, duration, requestId);
          });
        }
      },
    }),
  }),
});

export const { useSearchQuery } = searchApi;
