import { trackSchemaEvent } from "metabase/utils/analytics";
import { hashSearchTerm, shouldReportSearchTerm } from "metabase/utils/search";
import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

type SearchRequestFilter = Pick<
  SearchRequest,
  | "created_by"
  | "created_at"
  | "last_edited_at"
  | "last_edited_by"
  | "verified"
  | "search_native_query"
  | "context"
  | "models"
  | "archived"
  | "q"
  | "offset"
>;

const trackSearchRequest = (
  searchRequest: SearchRequestFilter,
  searchResponse: SearchResponse,
  duration: number,
  requestId: string | null = null,
) => {
  const dispatchTrackSearchQuery = async () => {
    trackSchemaEvent("search", {
      event: "search_query",
      search_term_hash: searchRequest.q
        ? await hashSearchTerm(searchRequest.q)
        : null,
      search_term:
        shouldReportSearchTerm() && searchRequest.q ? searchRequest.q : null,
      content_type: searchRequest.models ?? null,
      creator: !!searchRequest.created_by,
      creation_date: !!searchRequest.created_at,
      last_edit_date: !!searchRequest.last_edited_at,
      last_editor: !!searchRequest.last_edited_by,
      verified_items: !!searchRequest.verified,
      search_native_queries: !!searchRequest.search_native_query,
      search_archived: !!searchRequest.archived,
      context: searchRequest.context ?? null,
      runtime_milliseconds: duration,
      total_results: searchResponse.total,
      page_results: searchResponse.limit,
      search_engine: searchResponse.engine,
      request_id: requestId,
      offset: searchRequest.offset ?? null,
    });
  };
  dispatchTrackSearchQuery();
};

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
