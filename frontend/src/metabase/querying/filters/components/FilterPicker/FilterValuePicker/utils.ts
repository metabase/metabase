import { t } from "ttag";

import type { DimensionValuesInfo } from "metabase-lib";
import * as Lib from "metabase-lib";

export function canListFieldValues({
  fieldId,
  hasFieldValues,
}: DimensionValuesInfo): boolean {
  return fieldId != null && hasFieldValues === "list";
}

export function canSearchFieldValues({
  searchFieldId,
  hasFieldValues,
}: DimensionValuesInfo): boolean {
  return searchFieldId != null && hasFieldValues === "search";
}

export function canRemapFieldValues({
  fieldId,
  searchFieldId,
}: DimensionValuesInfo): boolean {
  return fieldId != null && searchFieldId != null && fieldId !== searchFieldId;
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
