import * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";
import type { NumberValue } from "./types";

function isNotEmpty(value: NumberValue) {
  return value !== "";
}

export function getDefaultValues(
  operator: Lib.CoordinateFilterOperatorName,
  values: NumberValue[] = [],
): NumberValue[] {
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotEmpty);
  }

  return Array(valueCount)
    .fill("")
    .map((value, index) => values[index] ?? value);
}

export function hasValidValues(
  operator: Lib.CoordinateFilterOperatorName,
  values: NumberValue[] = [],
): values is number[] {
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (!values.every(isNotEmpty)) {
    return false;
  }

  return hasMultipleValues ? values.length > 0 : values.length === valueCount;
}

export function getAvailableColumns(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const isLatitude = Lib.isLatitude(column);
  return Lib.filterableColumns(query, stageIndex).filter(column => {
    return isLatitude ? Lib.isLongitude(column) : Lib.isLatitude(column);
  });
}

export function getDefaultSecondColumn(
  columns: Lib.ColumnMetadata[],
  longitudeColumn?: Lib.ColumnMetadata,
) {
  return longitudeColumn ?? columns[0];
}

export function canPickColumns(
  operator: Lib.CoordinateFilterOperatorName,
  columns: Lib.ColumnMetadata[],
) {
  return operator === "inside" && columns.length > 1;
}

export function getFilterClause(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: number[],
) {
  if (operator !== "inside") {
    return Lib.coordinateFilterClause({
      operator,
      column,
      values,
    });
  }

  const latitudeColumn =
    secondColumn && Lib.isLatitude(secondColumn) ? secondColumn : column;
  const longitudeColumn =
    secondColumn && Lib.isLongitude(secondColumn) ? secondColumn : column;

  return Lib.coordinateFilterClause({
    operator,
    column: latitudeColumn,
    longitudeColumn,
    values,
  });
}
