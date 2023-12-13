import { MetabaseApi } from "metabase/services";
import type { FieldId, FieldValue } from "metabase-types/api";

export function searchValues(
  fieldId: FieldId,
  value: string,
): Promise<FieldValue[]> {
  if (value) {
    return MetabaseApi.field_search({
      fieldId,
      searchFieldId: fieldId,
      value,
    });
  }

  return Promise.resolve([]);
}
