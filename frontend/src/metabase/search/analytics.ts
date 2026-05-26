import { trackSchemaEvent } from "metabase/analytics";
import { hashSearchTerm, shouldReportSearchTerm } from "metabase/utils/search";
import type { SearchRequest } from "metabase-types/api";

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
