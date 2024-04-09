import type { FieldValue } from "metabase-types/api";

import { SEARCH_LIMIT } from "./constants";

export function shouldSearch(
  searchValue: string,
  searchQuery: string,
  fieldValues: FieldValue[],
) {
  const isExtensionOfLastSearch =
    searchQuery.length > 0 && searchValue.startsWith(searchQuery);
  const hasMoreValues = fieldValues.length === SEARCH_LIMIT;

  return !isExtensionOfLastSearch || hasMoreValues;
}
