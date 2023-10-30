import { trackSchemaEvent } from "metabase/lib/analytics";
import type {
  SearchQueryParamValue,
  URLSearchFilterQueryParams,
} from "metabase/search/types";

function getContentType(
  type: SearchQueryParamValue,
): Array<SearchQueryParamValue> | null {
  if (type) {
    return Array.isArray(type) ? type : [type];
  }
  return null;
}

function isFilterEmpty(
  filters: Record<string, boolean | SearchQueryParamValue[] | null>,
) {
  return Object.values(filters).every(value => !value);
}

export const trackSearchEvents = ({
  searchFilters,
}: {
  searchFilters: URLSearchFilterQueryParams;
}) => {
  const filterBooleanPayload: Record<
    string,
    boolean | SearchQueryParamValue[] | null
  > = {
    creator: Boolean(searchFilters.created_by),
    last_editor: Boolean(searchFilters.last_edited_by),
    creation_date: Boolean(searchFilters.created_at),
    last_edit_date: Boolean(searchFilters.last_edited_at),
    verified_items: Boolean(searchFilters.verified),
    search_native_queries: Boolean(searchFilters.search_native_query),
    content_type: getContentType(searchFilters.type),
  };

  // we just want to track search filters if the user is using them
  if (isFilterEmpty(filterBooleanPayload)) {
    return;
  }

  trackSchemaEvent("search", "1-0-1", {
    event: "search_results_filtered",
    ...filterBooleanPayload,
  });
};
