import type { ComboboxItem } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import type { FieldValuesResponse } from "./types";

export function canShowListPicker({
  values,
  has_more_values,
}: FieldValuesResponse): boolean {
  return values.length > 0 && !has_more_values;
}

export function canShowSearchPicker(
  canListValues: boolean,
  canSearchValues: boolean,
  fieldData: FieldValuesResponse | undefined,
): boolean {
  return (canListValues && !!fieldData?.has_more_values) || canSearchValues;
}

export function getFieldOption([value, label]: FieldValue): ComboboxItem {
  return {
    value: String(value),
    label: String(label ?? value),
  };
}

export function getFieldOptions(fieldValues: FieldValue[]): ComboboxItem[] {
  return fieldValues.filter(([value]) => value != null).map(getFieldOption);
}
