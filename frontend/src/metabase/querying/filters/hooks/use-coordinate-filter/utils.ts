import { isNotNull } from "metabase/lib/types";
import {
  getAvailableOperatorOptions,
  getDefaultAvailableOperator,
} from "metabase/querying/filters/utils/operators";
import * as Lib from "metabase-lib";

import { OPERATOR_OPTIONS } from "./constants";
import type {
  NumberOrEmptyValue,
  OperatorOption,
  UiCoordinateFilterOperator,
  UiCoordinateFilterParts,
} from "./types";

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

export function getOptionByOperator(operator: UiCoordinateFilterOperator) {
  return OPERATOR_OPTIONS[operator];
}

export function getDefaultOperator(
  availableOptions: OperatorOption[],
): UiCoordinateFilterOperator {
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
    (column) =>
      (isLatitude && Lib.isLongitude(column)) ||
      (isLongitude && Lib.isLatitude(column)),
  );
}

export function getDefaultSecondColumn(
  columns: Lib.ColumnMetadata[],
  filterParts: UiCoordinateFilterParts | null,
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
  operator: UiCoordinateFilterOperator,
  values: NumberOrEmptyValue[],
): NumberOrEmptyValue[] {
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotNull);
  }

  return Array(valueCount)
    .fill(null)
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: UiCoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, column, secondColumn, values) != null;
}

export function getFilterClause(
  operator: UiCoordinateFilterOperator,
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
  operator: UiCoordinateFilterOperator,
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
  operator: UiCoordinateFilterOperator,
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
  options?: Lib.CoordinateFilterOptions,
): Lib.CoordinateFilterParts | undefined {
  const [startValue, endValue] = values;
  const minInclusive = options?.minInclusive ?? true;
  const maxInclusive = options?.maxInclusive ?? true;

  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator,
      column,
      longitudeColumn: null,
      values: [minValue, maxValue],
      options: {
        minInclusive,
        maxInclusive,
      },
    };
  } else if (isNotNull(startValue)) {
    return {
      operator: minInclusive ? ">=" : ">",
      column,
      longitudeColumn: null,
      values: [startValue],
      options: {
        minInclusive,
      },
    };
  } else if (isNotNull(endValue)) {
    return {
      operator: maxInclusive ? "<=" : "<",
      column,
      longitudeColumn: null,
      values: [endValue],
      options: {
        maxInclusive,
      },
    };
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

export function normalizeCoordinateFilterParts({
  operator,
  column,
  longitudeColumn,
  values,
}: Lib.CoordinateFilterParts) {
  if (operator === ">") {
    return {
      operator: "between" as const,
      column,
      longitudeColumn,
      values: [values[0], null],
      options: {
        minInclusive: false,
        maxInclusive: false,
      },
    };
  }

  if (operator === "<") {
    return {
      operator: "between" as const,
      column,
      longitudeColumn,
      values: [null, values[0]],
      options: {
        minInclusive: false,
        maxInclusive: false,
      },
    };
  }

  if (operator === "<=") {
    return {
      operator: "between" as const,
      column,
      longitudeColumn,
      values: [null, values[0]],
      options: {
        minInclusive: false,
        maxInclusive: true,
      },
    };
  }

  if (operator === ">=") {
    return {
      operator: "between" as const,
      column,
      longitudeColumn,
      values: [values[0], null],
      options: {
        minInclusive: true,
        maxInclusive: false,
      },
    };
  }

  return {
    operator,
    column,
    longitudeColumn,
    values,
  };
}
