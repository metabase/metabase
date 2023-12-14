import type { FieldValuesInfo } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { FieldValue, FieldValuesResult } from "metabase-types/api";
import { MAX_INLINE_OPTIONS } from "./constants";
import type { Option } from "./types";

export function canLoadFieldValues({
  fieldId,
  hasFieldValues,
}: FieldValuesInfo) {
  return fieldId != null && hasFieldValues === "list";
}

export function canListFieldValues(
  { values, has_more_values }: FieldValuesResult,
  isCompact: boolean,
) {
  return (
    values.length > 0 &&
    (values.length <= MAX_INLINE_OPTIONS || !isCompact) &&
    !has_more_values
  );
}

export function canSearchFieldValues({
  fieldId,
  searchFieldId,
  hasFieldValues,
}: FieldValuesInfo) {
  return (
    fieldId != null &&
    searchFieldId != null &&
    (hasFieldValues === "list" || hasFieldValues === "search")
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
