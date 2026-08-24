import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { registerSearchStarted, trackFulfilledSearch } from "./analytics";
import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";
import { pick } from "./utils/pick";

export const searchApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/search",
        params: pick(params, [
          "q",
          "archived",
          "table_db_id",
          "models",
          "ids",
          "filter_items_in_personal_collection",
          "context",
          "created_at",
          "created_by",
          "last_edited_at",
          "last_edited_by",
          "search_native_query",
          "verified",
          "model_ancestors",
          "include_dashboard_questions",
          "include_metadata",
          "search_engine",
          "display_type",
          "collection",
          "calculate_available_models",
          "limit",
          "offset",
        ]),
      }),
      providesTags: (response, error, { models }) =>
        provideSearchItemListTags(response?.data ?? [], models),
      onQueryStarted: (args, { queryFulfilled, requestId }) => {
        registerSearchStarted(args, requestId);
        const start = Date.now();
        return handleQueryFulfilled(queryFulfilled, (data) =>
          trackFulfilledSearch(args, data, Date.now() - start, requestId),
        );
      },
    }),
  }),
});

export const { useSearchQuery } = searchApi;
