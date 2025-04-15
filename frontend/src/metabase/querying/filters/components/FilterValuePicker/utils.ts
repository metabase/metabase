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
    return t`Enter an ID`;
  } else if (isNumeric) {
    return t`Enter a number`;
  } else {
    return t`Enter some text`;
  }
}

export function getSearchPlaceholder(
  column: Lib.ColumnMetadata,
  searchColumName: string,
) {
  const isID = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);

  if (isID) {
    return t`Search by ${searchColumName} or enter an ID`;
  } else {
    return t`Search by ${searchColumName}`;
  }
}

export function getNothingFoundMessage(searchColumName: string) {
  return t`No matching ${searchColumName} found.`;
}
