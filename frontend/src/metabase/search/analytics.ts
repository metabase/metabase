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
  trackSchemaEvent("search", "1-1-0", {
    event: "search_query",
    content_type: searchRequest.models,
    creator: !!searchRequest.created_by,
    creation_date: !!searchRequest.created_at,
    last_edit_date: !!searchRequest.last_edited_at,
    last_editor: !!searchRequest.last_edited_by,
    verified_items: !!searchRequest.verified,
    search_native_queries: !!searchRequest.search_native_query,
    search_archived: !!searchRequest.archived,
    context: searchRequest.context,
    runtime_milliseconds: duration,
    total_results: searchResponse.total,
    page_results: searchResponse.limit,
  });
};

export const trackSearchClick = (
  itemType: "item" | "view_more",
  position: number,
  context: SearchRequest["context"],
) => {
  trackSchemaEvent("search", "1-1-0", {
    event: "search_click",
    position,
    target_type: itemType,
    context,
  });
};
