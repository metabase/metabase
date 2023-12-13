import { MetabaseApi } from "metabase/services";
import type { FieldId, FieldValue } from "metabase-types/api";
import { SEARCH_LIMIT } from "./constants";

export function getSearchValues(
  fieldId: FieldId,
  searchValue: string,
): Promise<FieldValue[]> {
  if (searchValue !== "") {
    return MetabaseApi.field_search({
      fieldId,
      searchFieldId: fieldId,
      value: searchValue,
      limit: SEARCH_LIMIT,
    });
  }

  return Promise.resolve([]);
}

export function shouldSearch(
  data: FieldValue[],
  searchValue: string,
  lastSearchValue: string,
) {
  const isLastSearchEmpty = lastSearchValue === "";
  const isExtensionOfLastSearch = searchValue.startsWith(lastSearchValue);
  const hasMoreValues = data.length === SEARCH_LIMIT;

  return isLastSearchEmpty || !isExtensionOfLastSearch || hasMoreValues;
}
