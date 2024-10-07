import { t } from "ttag";

import type { SelectOption } from "metabase/ui";
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

export function getFilteredOptions(
  options: SelectOption[],
  searchValue: string,
  selectedValues: string[],
) {
  return options.filter(
    option =>
      option.value === searchValue || !selectedValues.includes(option.value),
  );
}

export function getNothingFoundMessage(
  columnDisplayName: string,
  searchError: unknown,
  canSearch: boolean,
  isSearching: boolean,
) {
  if (!canSearch || isSearching) {
    return null;
  } else if (searchError) {
    return t`An error occurred.`;
  } else {
    return t`No matching ${columnDisplayName} found.`;
  }
}
