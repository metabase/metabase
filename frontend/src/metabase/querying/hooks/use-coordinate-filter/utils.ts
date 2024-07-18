import {
  getAvailableOperatorOptions,
  getDefaultAvailableOperator,
} from "metabase/querying/utils/filters";
import * as Lib from "metabase-lib";

import { OPERATOR_OPTIONS } from "./constants";
import type { NumberValue, OperatorOption } from "./types";

function isNotEmpty(value: NumberValue): value is number {
  return value !== "";
}

export function getAvailableOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return getAvailableOperatorOptions(
    query,
    stageIndex,
    column,
    OPERATOR_OPTIONS,
  );
}

export function getOptionByOperator(
  operator: Lib.CoordinateFilterOperatorName,
) {
  return OPERATOR_OPTIONS[operator];
}

export function getDefaultOperator(
  availableOptions: OperatorOption[],
): Lib.CoordinateFilterOperatorName {
  return getDefaultAvailableOperator(availableOptions, "between");
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
): Lib.ColumnMetadata | undefined {
  return longitudeColumn ?? columns[0];
}

export function canPickColumns(
  operator: Lib.CoordinateFilterOperatorName,
  columns: Lib.ColumnMetadata[],
) {
  return operator === "inside" && columns.length > 1;
}

export function getDefaultValues(
  operator: Lib.CoordinateFilterOperatorName,
  values: NumberValue[],
): NumberValue[] {
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotEmpty);
  }

  return Array(valueCount)
    .fill("")
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberValue[],
) {
  return getFilterParts(operator, column, secondColumn, values) != null;
}

export function getFilterClause(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberValue[],
) {
  const filterParts = getFilterParts(operator, column, secondColumn, values);
  return filterParts != null
    ? Lib.coordinateFilterClause(filterParts)
    : undefined;
}

function getFilterParts(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberValue[],
): Lib.CoordinateFilterParts | undefined {
  switch (operator) {
    case "between":
      return getBetweenFilterParts(operator, column, values);
    case "inside":
      return getInsideFilterParts(operator, column, secondColumn, values);
    default:
      return getSimpleFilterParts(operator, column, values);
  }
}

function getSimpleFilterParts(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: NumberValue[],
): Lib.CoordinateFilterParts | undefined {
  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  if (!values.every(isNotEmpty)) {
    return undefined;
  }
  if (hasMultipleValues ? values.length === 0 : values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    values: values.filter(isNotEmpty),
  };
}

function getBetweenFilterParts(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: NumberValue[],
): Lib.CoordinateFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotEmpty(startValue) && isNotEmpty(endValue)) {
    return {
      operator,
      column,
      values: [Math.min(startValue, endValue), Math.max(startValue, endValue)],
    };
  } else if (isNotEmpty(startValue)) {
    return {
      operator: ">=",
      column,
      values: [startValue],
    };
  } else if (isNotEmpty(endValue)) {
    return {
      operator: "<=",
      column,
      values: [endValue],
    };
  } else {
    return undefined;
  }
}

function getInsideFilterParts(
  operator: Lib.CoordinateFilterOperatorName,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberValue[],
): Lib.CoordinateFilterParts | undefined {
  if (!values.every(isNotEmpty)) {
    return undefined;
  }
  if (secondColumn == null) {
    return undefined;
  }

  const isLatitude = Lib.isLatitude(column);
  const [upperLatitude, leftLongitude, lowerLatitude, rightLongitude] = values;

  return {
    operator,
    column: isLatitude ? column : secondColumn,
    longitudeColumn: isLatitude ? secondColumn : column,
    values: [
      Math.max(upperLatitude, lowerLatitude),
      Math.min(leftLongitude, rightLongitude),
      Math.min(lowerLatitude, upperLatitude),
      Math.max(leftLongitude, rightLongitude),
    ],
  };
}
