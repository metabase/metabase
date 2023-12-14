import * as Lib from "metabase-lib";
import type { ColumnItem } from "../types";

const isPlainCategory = (column: Lib.ColumnMetadata) => {
  return Lib.isCategory(column) && !Lib.isAddress(column);
};

const isPlainNumber = (column: Lib.ColumnMetadata) => {
  return Lib.isNumber(column) && !Lib.isCoordinate(column);
};

const isShortText = (column: Lib.ColumnMetadata) =>
  Lib.isString(column) && !isLongText(column);

const isLongText = (column: Lib.ColumnMetadata) =>
  Lib.isComment(column) || Lib.isDescription(column);

const PRIORITIES = [
  Lib.isDate,
  Lib.isBoolean,
  isPlainCategory,
  Lib.isCurrency,
  Lib.isAddress,
  isPlainNumber,
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
