import _ from "underscore";

import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { trackSearchRequest } from "./analytics";
import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

// The document editor's entity typeahead ("document" context) searches on every keystroke (it has no
// request-level debounce), so debounce its analytics to record the settled query once rather than one
// event per character. Other surfaces already debounce their requests, so they track instantly.
const DOCUMENT_SEARCH_TRACK_DEBOUNCE_MS = 300;
const trackSettledDocumentSearch = _.debounce(
  trackSearchRequest,
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
        // Only track searches with an actual text query. Query-less requests are filter/available-model
        // lookups and internal existence probes, not searches the user performed.
        if (args.q?.trim()) {
          const start = Date.now();
          return handleQueryFulfilled(queryFulfilled, (data) => {
            const duration = Date.now() - start;
            const track =
              args.context === "document"
                ? trackSettledDocumentSearch
                : trackSearchRequest;
            track(args, data, duration, requestId);
          });
        }
      },
    }),
  }),
});

export const { useSearchQuery } = searchApi;
