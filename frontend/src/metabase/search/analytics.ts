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
  requestId: string | null = null,
) => {
  trackSchemaEvent("search", {
    event: "search_query",
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
  });
};

export const trackSearchClick = (
  itemType: "item",
  position: number,
  context: SearchRequest["context"],
  searchEngine: string,
  requestId: string | null = null,
) => {
  trackSchemaEvent("search", {
    event: "search_click",
    position,
    target_type: itemType,
    context: context ?? null,
    search_engine: searchEngine,
    request_id: requestId,
  });
};
