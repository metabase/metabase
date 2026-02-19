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
