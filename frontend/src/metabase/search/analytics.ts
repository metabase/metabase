import { trackSchemaEvent } from "metabase/lib/analytics";
import type { URLSearchFilterQueryParams } from "metabase/search/types";

const isFilterApplied = (value: unknown, defaultValue: unknown = false) => {
  return !!value ?? defaultValue;
};

export const trackSearchEvents = ({
  searchFilters,
}: {
  searchFilters: URLSearchFilterQueryParams;
}) => {
  const content_type = searchFilters.type
    ? Array.isArray(searchFilters.type)
      ? searchFilters.type
      : [searchFilters.type]
    : null;

  trackSchemaEvent("search", "1-0-1", {
    event: "search_results_filtered",
    content_type,
    creator: isFilterApplied(searchFilters.created_by),
    last_editor: isFilterApplied(searchFilters.last_edited_by),
    creation_date: isFilterApplied(searchFilters.created_at),
    last_edit_date: isFilterApplied(searchFilters.last_edited_at),
    verified_items: isFilterApplied(searchFilters.verified),
    search_native_queries: isFilterApplied(searchFilters.search_native_query),
  });
};
