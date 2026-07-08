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

// The document typeahead has no request-level debounce (it searches per keystroke), unlike every
// other search surface, so its analytics settle here instead.
const DOCUMENT_SEARCH_TRACK_DEBOUNCE_MS = 300;

let latestDocumentSearchRequestId: string | null = null;

const trackSettledDocumentSearch = _.debounce(
  (
    ...[args, data, duration, requestId]: Parameters<typeof trackSearchRequest>
  ) => {
    // Re-checked at fire time: a newer request may have started while this event sat queued.
    if (latestDocumentSearchRequestId === requestId) {
      trackSearchRequest(args, data, duration, requestId);
    }
  },
  DOCUMENT_SEARCH_TRACK_DEBOUNCE_MS,
);

/**
 * Record that a search request started, before any response arrives.
 * Call it for every request so newer document searches supersede pending analytics for older ones.
 */
export const registerSearchStarted = (
  args: SearchRequest,
  requestId: string,
) => {
  if (args.context === "document") {
    latestDocumentSearchRequestId = requestId;
  }
};

/**
 * Publish the search_query event for a fulfilled search request.
 *
 * Query-less requests are not tracked; they are filter/available-model lookups and existence
 * probes, not searches the user performed.
 * Document-context events are debounced to one per settled query, where "settled" is approximate:
 * two document searches fulfilling within the debounce window collapse into the later one; a query
 * re-settled from cache emits nothing new; an abandoned query's late response may still emit while
 * a superseded query whose successor never fulfills emits nothing; and a pending event is lost if
 * the page unloads within the window.
 */
export const trackFulfilledSearch = (
  args: SearchRequest,
  data: SearchResponse,
  duration: number,
  requestId: string,
) => {
  if (!args.q?.trim()) {
    return;
  }

  if (args.context !== "document") {
    trackSearchRequest(args, data, duration, requestId);
  } else if (latestDocumentSearchRequestId === requestId) {
    // Checked at schedule time too, so a stale out-of-order response can't overwrite the queued args.
    trackSettledDocumentSearch(args, data, duration, requestId);
  }
};
