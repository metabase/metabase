import { t } from "ttag";

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

export function getEmptyResultsMessage(
  nothingFoundMessage: string | undefined,
  searchError: unknown,
  canSearch: boolean,
  isSearching: boolean,
) {
  if (!canSearch || isSearching) {
    return null;
  } else if (searchError) {
    return t`An error occurred.`;
  } else {
    return nothingFoundMessage;
  }
}
