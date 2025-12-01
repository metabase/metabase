import { trackSchemaEvent } from "metabase/lib/analytics";
import Settings from "metabase/lib/settings";
import type { SearchRequest, SearchResponse } from "metabase-types/api";

const MB_STATS_ANALYTICS_UUID = "d97541bd-59b0-4656-b437-d659ac48eae1";

const shouldReportSearchTerm = () =>
  Settings.get("analytics-uuid") === MB_STATS_ANALYTICS_UUID;

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

async function hashSearchTerm(searchTerm: string) {
  try {
    const analyticsUuid = Settings.get("analytics-uuid");
    const saltedSearchTerm = searchTerm + "-salt-" + analyticsUuid;

    const dataBuffer = new TextEncoder().encode(saltedSearchTerm);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (err) {
    console.warn("Failed to hash search term", err);
    return null;
  }
}

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

type TrackSearchClickParams = {
  itemType: "item" | "view_more";
  position: number;
  context: SearchRequest["context"];
  searchEngine: string;
  requestId?: string | null;
  entityModel?: string | null;
  entityId?: number | null;
  searchTerm?: string | null;
};

export const trackSearchClick = ({
  itemType,
  position,
  context,
  searchEngine,
  requestId = null,
  entityModel = null,
  entityId = null,
  searchTerm = null,
}: TrackSearchClickParams) => {
  const dispatchTrackSearchClick = async () => {
    trackSchemaEvent("search", {
      event: "search_click",
      position,
      target_type: itemType,
      context: context ?? null,
      search_engine: searchEngine,
      request_id: requestId,
      entity_model: entityModel,
      entity_id: entityId,
      search_term_hash: searchTerm ? await hashSearchTerm(searchTerm) : null,
      search_term: shouldReportSearchTerm() && searchTerm ? searchTerm : null,
    });
  };

  dispatchTrackSearchClick();
};
