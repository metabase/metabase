import { t } from "ttag";

import type { ComboboxItem } from "metabase/ui";
import type { FieldValuesSearchInfo } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { FieldValue, GetFieldValuesResponse } from "metabase-types/api";

export function canLoadFieldValues({
  fieldId,
  hasFieldValues,
}: FieldValuesSearchInfo): boolean {
  return fieldId != null && hasFieldValues === "list";
}

export function canListFieldValues({
  values,
  has_more_values,
}: GetFieldValuesResponse): boolean {
  return values.length > 0 && !has_more_values;
}

export function canSearchFieldValues(
  { fieldId, searchFieldId, hasFieldValues }: FieldValuesSearchInfo,
  fieldData: GetFieldValuesResponse | undefined,
): boolean {
  return (
    fieldId != null &&
    searchFieldId != null &&
    ((hasFieldValues === "list" && fieldData?.has_more_values) ||
      hasFieldValues === "search")
  );
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

export function getStaticPlaceholder(column: Lib.ColumnMetadata) {
  const isID = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
  const isNumeric = Lib.isNumeric(column);

  if (isID) {
    return t`Search by ID`;
  } else if (isNumeric) {
    return t`Enter a number`;
  } else {
    return t`Enter some text`;
  }
}

export function getSearchPlaceholder(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  searchColumn: Lib.ColumnMetadata,
) {
  const isID = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
  const isNumeric = Lib.isNumeric(column);
  const searchColumnInfo = Lib.displayInfo(query, stageIndex, searchColumn);
  const searchColumnName = searchColumnInfo.displayName;

  if (isID) {
    return t`Search by ${searchColumnName} or enter an ID`;
  } else if (isNumeric) {
    return t`Search by ${searchColumnName} or enter a number`;
  } else {
    return t`Search by ${searchColumnName}`;
  }
}

export function getNothingFoundMessage(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
  return t`No matching ${columnInfo.displayName} found.`;
}
