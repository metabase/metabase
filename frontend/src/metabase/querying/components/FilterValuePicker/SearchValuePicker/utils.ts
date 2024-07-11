import { t } from "ttag";

import type { FieldValue } from "metabase-types/api";

import { SEARCH_LIMIT } from "./constants";

export function getIsSearchStale(
  searchValue: string,
  searchQuery: string,
  fieldValues: FieldValue[],
) {
  const isExtensionOfLastSearch =
    searchQuery.length > 0 && searchValue.startsWith(searchQuery);
  const hasMoreValues = fieldValues.length === SEARCH_LIMIT;

  return !isExtensionOfLastSearch || hasMoreValues;
}

export function getNothingFoundMessage(
  columnName: string,
  searchError: unknown,
  isSearching: boolean,
  isSearchStale: boolean,
) {
  if (isSearching || isSearchStale) {
    return null;
  } else if (searchError) {
    return t`An error occurred.`;
  } else {
    return t`No matching ${columnName} found.`;
  }
}
