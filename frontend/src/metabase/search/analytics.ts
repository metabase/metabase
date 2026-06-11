import { trackSchemaEvent } from "metabase/analytics";
import { hashSearchTerm, shouldReportSearchTerm } from "metabase/utils/search";
import type { SearchContext, SearchRequest } from "metabase-types/api";

// The search `context` values we publish Snowplow analytics events for.
// The other contexts (data pickers, browse, etc.) also issue searches; we don't publish those because it
// would require a Snowplow schema migration — this list must stay a subset of the `context` enum in the
// iglu `search` schema (snowplow/iglu-client-embedded/schemas/com.metabase/search/jsonschema/*).
const ANALYTICS_TRACKED_CONTEXTS = [
  "search-app",
  "search-bar",
  "command-palette",
  "entity-picker",
] as const satisfies readonly SearchContext[];

export type AnalyticsSearchContext =
  (typeof ANALYTICS_TRACKED_CONTEXTS)[number];

export const isTrackedSearchContext = (
  context: SearchContext | null | undefined,
): context is AnalyticsSearchContext =>
  context != null &&
  (ANALYTICS_TRACKED_CONTEXTS as readonly SearchContext[]).includes(context);

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
      context: isTrackedSearchContext(context) ? context : null,
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
