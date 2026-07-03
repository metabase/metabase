import _ from "underscore";

import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { trackSearchRequest } from "./analytics";
import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

// The document editor's entity typeahead ("document" context) searches on every keystroke (it has no
// request-level debounce), so debounce its analytics to record the settled query once rather than one
// event per character. Other surfaces already debounce their requests, so they track instantly.
//
// A query only counts as settled if no newer document request (including query-less ones, e.g. a
// cleared input) starts before the debounce fires. Responses can also fulfill out of typing order, so
// the newest-request marker is checked both when scheduling (a slow stale response must not overwrite
// the queued args) and when firing (a newer request must invalidate an already-queued event).
const DOCUMENT_SEARCH_TRACK_DEBOUNCE_MS = 300;

let latestDocumentSearchRequestId: string | null = null;

const trackSettledDocumentSearch = _.debounce(
  (
    ...[args, data, duration, requestId]: Parameters<typeof trackSearchRequest>
  ) => {
    if (latestDocumentSearchRequestId === requestId) {
      trackSearchRequest(args, data, duration, requestId);
    }
  },
  DOCUMENT_SEARCH_TRACK_DEBOUNCE_MS,
);

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
        const isDocumentSearch = args.context === "document";
        if (isDocumentSearch) {
          // Advance the marker even for query-less requests, so clearing the input supersedes any
          // still-in-flight search whose late response would otherwise emit a stale event.
          latestDocumentSearchRequestId = requestId;
        }

        // Only track searches with an actual text query. Query-less requests are filter/available-model
        // lookups and internal existence probes, not searches the user performed.
        if (args.q?.trim()) {
          const start = Date.now();
          return handleQueryFulfilled(queryFulfilled, (data) => {
            const duration = Date.now() - start;
            if (!isDocumentSearch) {
              trackSearchRequest(args, data, duration, requestId);
            } else if (latestDocumentSearchRequestId === requestId) {
              trackSettledDocumentSearch(args, data, duration, requestId);
            }
          });
        }
      },
    }),
  }),
});

export const { useSearchQuery } = searchApi;
