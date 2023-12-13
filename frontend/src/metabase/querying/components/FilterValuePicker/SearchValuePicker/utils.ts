import { MetabaseApi } from "metabase/services";
import type { FieldId, FieldValue } from "metabase-types/api";
import { SEARCH_LIMIT } from "./constants";

export function searchValues(
  fieldId: FieldId,
  value: string,
): Promise<FieldValue[]> {
  if (value) {
    return MetabaseApi.field_search({
      fieldId,
      searchFieldId: fieldId,
      value,
      limit: SEARCH_LIMIT,
    });
  }

  return Promise.resolve([]);
}
