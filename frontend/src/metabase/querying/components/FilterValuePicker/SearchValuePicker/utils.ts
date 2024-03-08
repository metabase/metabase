import { MetabaseApi } from "metabase/services";
import type { SelectItem } from "metabase/ui";
import type { FieldId, FieldValue } from "metabase-types/api";

import { SEARCH_LIMIT } from "./constants";

export function getSearchValues(
  fieldId: FieldId,
  searchFieldId: FieldId,
  searchQuery: string,
): Promise<FieldValue[] | undefined> {
  if (searchQuery) {
    return MetabaseApi.field_search({
      fieldId,
      searchFieldId,
      value: searchQuery,
      limit: SEARCH_LIMIT,
    });
  }

  return Promise.resolve(undefined);
}

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

export function getOptimisticOptions(
  options: SelectItem[],
  searchValue: string,
  canAddValue: (query: string) => boolean,
) {
  const isValid = canAddValue(searchValue);
  const isExisting = options.some(({ label }) => label === searchValue);

  return isValid && !isExisting
    ? [{ value: searchValue, label: searchValue }, ...options]
    : options;
}
