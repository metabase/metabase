import _ from "underscore";

import { trackSchemaEvent } from "metabase/analytics";
import { hashSearchTerm, shouldReportSearchTerm } from "metabase/common/search";
import { openSaveDialog } from "metabase/utils/dom";
import {
  toSnowplowContentTypes,
  toSnowplowContext,
} from "metabase-types/analytics";
import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";

export interface ExportAnalyticsResponse {
  filename: string;
}

export const analyticsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    exportAnalytics: builder.mutation<ExportAnalyticsResponse, void>({
      async queryFn(_arg, { signal }) {
        try {
          const response = await fetch(
            "/api/ee/audit-app/analytics-dev/export",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              signal,
            },
          );

          if (!response.ok) {
            return { error: new Error("Export failed") };
          }

          const contentDisposition = response.headers.get(
            "Content-Disposition",
          );
          const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
          const filename = filenameMatch?.[1] || "analytics-export.tar.gz";

          const fileContent = await response.blob();
          openSaveDialog(filename, fileContent);

          return { data: { filename } };
        } catch (error) {
          return { error };
        }
      },
    }),
  }),
});

export const { useExportAnalyticsMutation } = analyticsApi;

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
      content_type: toSnowplowContentTypes(searchRequest.models),
      creator: !!searchRequest.created_by,
      creation_date: !!searchRequest.created_at,
      last_edit_date: !!searchRequest.last_edited_at,
      last_editor: !!searchRequest.last_edited_by,
      verified_items: !!searchRequest.verified,
      search_native_queries: !!searchRequest.search_native_query,
      search_archived: !!searchRequest.archived,
      context: toSnowplowContext(searchRequest.context),
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

// The document editor's entity typeahead ("document" context) searches on every keystroke (it has no
// request-level debounce), so its analytics are debounced: one search_query per settled query rather
// than one per character. Other surfaces already debounce their requests, so they track instantly.
// A fulfillment may schedule the event only while its request is still the newest (out-of-order
// responses must not overwrite the settled query), and the guard re-runs when the debounce fires
// (a newer request invalidates an already-queued event).
//
// Known, accepted approximations of "settled":
// - Two settled document searches fulfilling within the debounce window collapse into the later one.
// - Cache hits don't restart the query lifecycle, so re-settling on an already-cached query emits
//   nothing new and the last network fulfillment's query wins.
// - Clearing the input issues no request (the typeahead switches back to recents), so a late
//   response for the abandoned query may still emit; conversely, a query whose request is
//   superseded and whose successor never fulfills emits nothing.
// - A pending event is lost if the page unloads within the debounce window.
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

export const registerSearchStarted = (
  args: SearchRequest,
  requestId: string,
) => {
  if (args.context === "document") {
    latestDocumentSearchRequestId = requestId;
  }
};

export const trackFulfilledSearch = (
  args: SearchRequest,
  data: SearchResponse,
  duration: number,
  requestId: string,
) => {
  // Only track searches with an actual text query. Query-less requests are filter/available-model
  // lookups and internal existence probes, not searches the user performed.
  if (!args.q?.trim()) {
    return;
  }

  if (args.context !== "document") {
    trackSearchRequest(args, data, duration, requestId);
  } else if (latestDocumentSearchRequestId === requestId) {
    trackSettledDocumentSearch(args, data, duration, requestId);
  }
};
