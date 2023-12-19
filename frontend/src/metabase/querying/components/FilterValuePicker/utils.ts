import type { FieldValuesSearchInfo } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { FieldValue, FieldValuesResult } from "metabase-types/api";
import { MAX_INLINE_OPTIONS } from "./constants";
import type { Option } from "./types";

export function canLoadFieldValues({
  fieldId,
  hasFieldValues,
}: FieldValuesSearchInfo) {
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

export function canSearchFieldValues(
  { fieldId, searchFieldId, hasFieldValues }: FieldValuesSearchInfo,
  fieldData: FieldValuesResult | undefined,
) {
  return (
    fieldId != null &&
    searchFieldId != null &&
    ((hasFieldValues === "list" && fieldData?.has_more_values) ||
      hasFieldValues === "search")
  );
}

export function getFieldOptions(fieldValues: FieldValue[]): Option[] {
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
    ...getFieldOptions(fieldValues),
    ...getSelectedOptions(selectedValues),
  ];

  const mapping = options.reduce((map: Record<string, string>, option) => {
    map[option.value] ??= option.label;
    return map;
  }, {});

  return Object.entries(mapping).map(([value, label]) => ({ value, label }));
}

export function hasDuplicateOption(options: Option[], query: string) {
  return options.some(option => option.value === query);
}

export function isKeyColumn(column: Lib.ColumnMetadata) {
  return Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
}
