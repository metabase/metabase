import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

import { OPERATORS } from "./constants";
import type {
  CoordinateFilterOperatorOption,
  CoordinatePickerOperator,
  NumberOrEmptyValue,
} from "./types";

export function getAvailableOptions(): CoordinateFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName:
      operator === "not-between"
        ? t`Not between`
        : Lib.describeFilterOperator(operator),
  }));
}

export function getOptionByOperator(operator: CoordinatePickerOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(): CoordinatePickerOperator {
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
  operator: CoordinatePickerOperator,
  columns: Lib.ColumnMetadata[],
) {
  return operator === "inside" && columns.length > 1;
}

export function getDefaultValues(
  operator: CoordinatePickerOperator,
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
  operator: CoordinatePickerOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, column, secondColumn, values) != null;
}

export function getFilterClause(
  operator: CoordinatePickerOperator,
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
  operator: CoordinatePickerOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  switch (operator) {
    case "between":
    case "not-between":
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
  operator: Extract<CoordinatePickerOperator, "between" | "not-between">,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator: "between",
      column,
      longitudeColumn: null,
      isNot: operator === "not-between",
      values: [minValue, maxValue],
    };
  } else if (operator === "not-between") {
    return undefined;
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
