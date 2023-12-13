import type { FieldValue } from "metabase-types/api";
import { MAX_INLINE_OPTIONS } from "./constants";
import type { Option } from "./types";

function getFieldOptions(fieldValues: FieldValue[]): Option[] {
  return fieldValues.map(([value, label = value]) => ({
    value: String(value),
    label: String(label),
  }));
}

function getStaticOptions(selectedValues: string[]): Option[] {
  return selectedValues.map(value => ({
    value,
    label: value,
  }));
}

export function getEffectiveOptions(
  fieldValues: FieldValue[],
  selectedValues: string[],
): Option[] {
  const options = [
    ...getStaticOptions(selectedValues),
    ...getFieldOptions(fieldValues),
  ];

  return Object.entries(
    Object.fromEntries(options.map(option => [option.value, option.label])),
  ).map(([value, label]) => ({ value, label }));
}

export function isInlinePicker(data: FieldValue[], compact: boolean) {
  return compact && data.length > 0 && data.length <= MAX_INLINE_OPTIONS;
}
