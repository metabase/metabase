import type { ColumnItem } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

function isCreationDateOrTimestamp(column: Lib.ColumnMetadata) {
  return Lib.isCreationDate(column) || Lib.isCreationTimestamp(column);
}

function isCategoryAndNotNameOrAddress(column: Lib.ColumnMetadata) {
  return (
    Lib.isCategory(column) &&
    !Lib.isEntityName(column) &&
    !Lib.isTitle(column) &&
    !Lib.isAddress(column)
  );
}

function isNumberAndNotCoordinate(column: Lib.ColumnMetadata) {
  return Lib.isNumber(column) && !Lib.isCoordinate(column);
}

function isShortText(column: Lib.ColumnMetadata) {
  return Lib.isStringOrStringLike(column) && !isLongText(column);
}

function isLongText(column: Lib.ColumnMetadata) {
  return Lib.isComment(column) || Lib.isDescription(column);
}

const PRIORITIES = [
  isCreationDateOrTimestamp,
  Lib.isCreationTime,
  Lib.isTemporal,
  Lib.isBoolean,
  isCategoryAndNotNameOrAddress,
  Lib.isCurrency,
  Lib.isCity,
  Lib.isState,
  Lib.isZipCode,
  Lib.isCountry,
  isNumberAndNotCoordinate,
  isShortText,
  Lib.isPrimaryKey,
  Lib.isLatitude,
  Lib.isLongitude,
  isLongText,
  Lib.isForeignKey,
  () => true,
];

export function sortColumns(columnItems: ColumnItem[]): ColumnItem[] {
  return columnItems
    .map(columnItem => ({
      priority: PRIORITIES.findIndex(predicate => predicate(columnItem.column)),
      columnItem,
    }))
    .sort((a, b) => a.priority - b.priority)
    .map(({ columnItem }) => columnItem);
}

export type SectionId =
  | "datetime"
  | "boolean"
  | "text"
  | "location"
  | "number"
  | "id"
  | "unknown";

export function getSectionId(column: ColumnItem["column"]): SectionId {
  if (isCreationDateOrTimestamp(column)) {
    return "datetime";
  }

  if (Lib.isCreationTime(column)) {
    return "datetime";
  }

  if (Lib.isTemporal(column)) {
    return "datetime";
  }

  if (Lib.isBoolean(column)) {
    return "boolean";
  }

  if (isCategoryAndNotNameOrAddress(column)) {
    return "text";
  }

  if (Lib.isCurrency(column)) {
    return "number";
  }

  if (Lib.isCity(column)) {
    return "location";
  }

  if (Lib.isState(column)) {
    return "location";
  }

  if (Lib.isZipCode(column)) {
    return "location";
  }

  if (Lib.isCountry(column)) {
    return "location";
  }

  if (isNumberAndNotCoordinate(column)) {
    return "number";
  }

  if (isShortText(column)) {
    return "text";
  }

  if (Lib.isPrimaryKey(column)) {
    return "id";
  }

  if (Lib.isLatitude(column)) {
    return "location";
  }

  if (Lib.isLongitude(column)) {
    return "location";
  }

  if (isLongText(column)) {
    return "text";
  }

  if (Lib.isForeignKey(column)) {
    return "id";
  }

  return "unknown";
}
