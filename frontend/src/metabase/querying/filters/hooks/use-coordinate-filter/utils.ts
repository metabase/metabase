import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

import { OPERATORS } from "./constants";
import type {
  CoordinateFilterOperatorOption,
  NumberOrEmptyValue,
} from "./types";

function getOperatorName(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
) {
  const isKey = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);

  switch (operator) {
    case "=":
      return isKey ? t`Is` : t`Equal to`;
    case "!=":
      return isKey ? t`Is not` : t`Not equal to`;
    case "inside":
      return t`Inside`;
    case ">":
      return t`Greater than`;
    case "<":
      return t`Less than`;
    case "between":
      return t`Between`;
    case ">=":
      return t`Greater than or equal to`;
    case "<=":
      return t`Less than or equal to`;
  }
}

export function getAvailableOptions(
  column: Lib.ColumnMetadata,
): CoordinateFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: getOperatorName(operator, column),
  }));
}

export function getOptionByOperator(operator: Lib.CoordinateFilterOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(): Lib.CoordinateFilterOperator {
  return "between";
}

export function getAvailableColumns(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const isLatitude = Lib.isLatitude(column);
  const isLongitude = Lib.isLongitude(column);
  return Lib.filterableColumns(query, stageIndex).filter(
    (column) =>
      (isLatitude && Lib.isLongitude(column)) ||
      (isLongitude && Lib.isLatitude(column)),
  );
}

export function getDefaultSecondColumn(
  columns: Lib.ColumnMetadata[],
  filterParts: Lib.CoordinateFilterParts | null,
): Lib.ColumnMetadata | undefined {
  return filterParts?.longitudeColumn ?? columns[0];
}

export function canPickColumns(
  operator: Lib.CoordinateFilterOperator,
  columns: Lib.ColumnMetadata[],
) {
  return operator === "inside" && columns.length > 1;
}

export function getDefaultValues(
  operator: Lib.CoordinateFilterOperator,
  values: NumberOrEmptyValue[],
): NumberOrEmptyValue[] {
  const { valueCount, hasMultipleValues } = OPERATORS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotNull);
  }

  return Array(valueCount)
    .fill(null)
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, column, secondColumn, values) != null;
}

export function getFilterClause(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  const filterParts = getFilterParts(operator, column, secondColumn, values);
  return filterParts != null
    ? Lib.coordinateFilterClause(filterParts)
    : undefined;
}

function getFilterParts(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
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
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  if (!values.every(isNotNull)) {
    return undefined;
  }
  if (hasMultipleValues ? values.length === 0 : values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    longitudeColumn: null,
    values: values.filter(isNotNull),
  };
}

function getBetweenFilterParts(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator,
      column,
      longitudeColumn: null,
      values: [minValue, maxValue],
    };
  } else if (isNotNull(startValue)) {
    return {
      operator: ">=",
      column,
      longitudeColumn: null,
      values: [startValue],
    };
  } else if (isNotNull(endValue)) {
    return {
      operator: "<=",
      column,
      longitudeColumn: null,
      values: [endValue],
    };
  } else {
    return undefined;
  }
}

function getInsideFilterParts(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  if (!values.every(isNotNull)) {
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
      lowerLatitude < upperLatitude ? upperLatitude : lowerLatitude,
      leftLongitude < rightLongitude ? leftLongitude : rightLongitude,
      lowerLatitude < upperLatitude ? lowerLatitude : upperLatitude,
      leftLongitude < rightLongitude ? rightLongitude : leftLongitude,
    ],
  };
}
