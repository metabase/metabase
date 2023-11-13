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
  const isLongitude = Lib.isLongitude(column);
  return Lib.filterableColumns(query, stageIndex).filter(
    column =>
      (isLatitude && Lib.isLongitude(column)) ||
      (isLongitude && Lib.isLatitude(column)),
  );
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
  return Lib.coordinateFilterClause({
    operator,
    column: getCoercedLatitudeColumn(operator, column, secondColumn),
    longitudeColumn: getCoercedLongitudeColumn(operator, column, secondColumn),
    values: getCoercedValues(operator, values),
  });
}

function getCoercedLatitudeColumn(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
) {
  return operator === "inside" &&
    secondColumn != null &&
    Lib.isLongitude(column) &&
    Lib.isLatitude(secondColumn)
    ? secondColumn
    : column;
}

function getCoercedLongitudeColumn(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
) {
  return operator === "inside" &&
    secondColumn != null &&
    Lib.isLatitude(column) &&
    Lib.isLongitude(secondColumn)
    ? secondColumn
    : column;
}

function getCoercedValues(
  operator: Lib.CoordinateFilterOperatorName,
  values: number[],
) {
  if (operator === "inside") {
    const [upperLatitude, leftLongitude, lowerLatitude, rightLongitude] =
      values;

    return [
      Math.max(upperLatitude, lowerLatitude),
      Math.min(leftLongitude, rightLongitude),
      Math.min(lowerLatitude, upperLatitude),
      Math.max(leftLongitude, rightLongitude),
    ];
  }

  if (operator === "between") {
    const [startValue, endValue] = values;
    return [Math.min(startValue, endValue), Math.max(startValue, endValue)];
  }

  return values;
}
