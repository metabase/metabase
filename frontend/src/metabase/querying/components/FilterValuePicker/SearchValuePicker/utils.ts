import { MetabaseApi } from "metabase/services";
import type { FieldId, FieldValue } from "metabase-types/api";
import { SEARCH_LIMIT } from "./constants";

export function getSearchValues(
  fieldId: FieldId,
  searchFieldId: FieldId,
  searchValue: string,
  initialFieldValues: FieldValue[],
): Promise<FieldValue[]> {
  if (searchValue) {
    return MetabaseApi.field_search({
      fieldId,
      searchFieldId,
      value: searchValue,
      limit: SEARCH_LIMIT,
    });
  }

  return Promise.resolve(initialFieldValues);
}

export function shouldSearch(
  fieldValues: FieldValue[],
  searchValue: string,
  lastSearchValue: string,
) {
  const isLastSearchEmpty = lastSearchValue === "";
  const isExtensionOfLastSearch = searchValue.startsWith(lastSearchValue);
  const hasMoreValues = fieldValues.length === SEARCH_LIMIT;

  return isLastSearchEmpty || !isExtensionOfLastSearch || hasMoreValues;
}
