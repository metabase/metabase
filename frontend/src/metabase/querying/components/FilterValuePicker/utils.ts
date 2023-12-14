import * as Lib from "metabase-lib";
import type { FieldId, FieldValue, FieldValuesType } from "metabase-types/api";
import { MAX_INLINE_OPTIONS } from "./constants";
import type { Option } from "./types";

export function canLoadFieldValues(
  fieldId: FieldId | null,
  hasFieldValues: FieldValuesType,
) {
  return fieldId != null && hasFieldValues === "list";
}

export function canListFieldValues(
  fieldValues: FieldValue[],
  isCompact: boolean,
) {
  return (
    fieldValues.length > 0 &&
    (fieldValues.length <= MAX_INLINE_OPTIONS || !isCompact)
  );
}

export function canSearchFieldValues(
  fieldId: FieldId | null,
  searchFieldId: FieldId | null,
  hasFieldValues: FieldValuesType,
) {
  return (
    fieldId != null && searchFieldId != null && hasFieldValues === "search"
  );
}

function getFieldOptions(fieldValues: FieldValue[]): Option[] {
  return fieldValues.map(([value, label = value]) => ({
    value: String(value),
    label: String(label),
  }));
}

function getSelectedOptions(selectedValues: string[]): Option[] {
  return selectedValues.map(value => ({
    value,
    label: value,
  }));
}

export function getMergedOptions(
  fieldValues: FieldValue[],
  selectedValues: string[],
): Option[] {
  const options = [
    ...getSelectedOptions(selectedValues),
    ...getFieldOptions(fieldValues),
  ];

  return Object.entries(
    Object.fromEntries(options.map(option => [option.value, option.label])),
  ).map(([value, label]) => ({ value, label }));
}

export function isKey(column: Lib.ColumnMetadata) {
  return Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
}
