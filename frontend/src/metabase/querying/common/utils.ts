import type { ComboboxItem } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

export function getFieldOption([value, label]: FieldValue): ComboboxItem {
  return {
    value: String(value),
    label: String(label ?? value),
  };
}

export function getFieldOptions(fieldValues: FieldValue[]): ComboboxItem[] {
  return fieldValues.filter(([value]) => value != null).map(getFieldOption);
}
