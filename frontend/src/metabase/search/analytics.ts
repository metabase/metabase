import { trackSchemaEvent } from "metabase/lib/analytics";
import type { URLSearchFilterQueryParams } from "metabase/search/types";

export const trackSearchEvents = ({
  searchFilters,
}: {
  searchFilters: URLSearchFilterQueryParams;
}) => {
  let content_type = null;

  if (searchFilters.type) {
    content_type = Array.isArray(searchFilters.type)
      ? searchFilters.type
      : [searchFilters.type];
  }

  const filterBooleanPayload: Record<string, unknown> = {
    creator: searchFilters.created_by,
    last_editor: searchFilters.last_edited_by,
    creation_date: searchFilters.created_at,
    last_edit_date: searchFilters.last_edited_at,
    verified_items: searchFilters.verified,
    search_native_queries: searchFilters.search_native_query,
  };

  Object.entries(searchFilters).forEach(([key, value]) => {
    filterBooleanPayload[key] = !!value;
  });

  trackSchemaEvent("search", "1-0-1", {
    event: "search_results_filtered",
    content_type,
    filterPayload: filterBooleanPayload,
  });
};
