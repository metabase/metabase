import { trackSchemaEvent } from "metabase/lib/analytics";
import type { SearchRequest, SearchResponse } from "metabase-types/api";

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
>;

export const trackSearchRequest = (
  searchRequest: SearchRequestFilter,
  searchResponse: SearchResponse,
  duration: number,
) => {
  trackSchemaEvent("search", "1-0-1", {
    event: "new_search_query",
    ...searchRequest,
    duration,
    total_results: searchResponse.total,
    pageResults: searchResponse.limit,
  });
};
