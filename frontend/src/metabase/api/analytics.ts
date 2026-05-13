import { trackSchemaEvent } from "metabase/analytics";
import { openSaveDialog } from "metabase/utils/dom";
import { hashSearchTerm, shouldReportSearchTerm } from "metabase/utils/search";
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

export const trackSearchRequest = (
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
