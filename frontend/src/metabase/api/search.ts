import { toSnowplowContext } from "metabase-types/analytics";
import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { trackSearchRequest } from "./analytics";
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
        // Only track searches from a surface already in the snowplow schema, with an actual text query.
        // Pending contexts (toSnowplowContext → null) stay unpublished until the schema is widened; so do
        // query-less requests (filter/available-model lookups, existence probes), which aren't searches.
        if (toSnowplowContext(args.context) != null && args.q?.trim()) {
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
