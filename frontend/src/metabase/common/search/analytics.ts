import { trackSchemaEvent } from "metabase/analytics";
import { toSnowplowContext } from "metabase-types/analytics";
import type { SearchContext } from "metabase-types/api";

import { hashSearchTerm, shouldReportSearchTerm } from "./term";

type TrackSearchClickParams = {
  itemType: "item" | "view_more";
  position: number;
  context: SearchContext;
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
      context: toSnowplowContext(context),
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
