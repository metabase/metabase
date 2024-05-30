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
  | "archived"
  | "q"
>;

export const trackSearchRequest = (
  searchRequest: SearchRequestFilter,
  searchResponse: SearchResponse,
  duration: number,
) => {
  trackSchemaEvent("search", "2-0-0", {
    event: "new_search_query",
    filters: {
      q: searchRequest.q,
      created_by: searchRequest.created_by,
      created_at: searchRequest.created_at,
      last_edited_at: searchRequest.last_edited_at,
      last_edited_by: searchRequest.last_edited_by,
      verified: searchRequest.verified,
      search_native_query: searchRequest.search_native_query,
      models: searchRequest.models,
      archived: searchRequest.archived,
    },
    context: searchRequest.context,
    response_time: duration,
    total_results: searchResponse.total,
    pageResults: searchResponse.limit,
  });
};

export const trackSearchClick = (
  itemType: "item" | "view_more",
  position: number,
  context: SearchRequest["context"],
) => {
  trackSchemaEvent("search", "2-0-0", {
    event: "search_click",
    position,
    target_type: itemType,
    context,
  });
};
