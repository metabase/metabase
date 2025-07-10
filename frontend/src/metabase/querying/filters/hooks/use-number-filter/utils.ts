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
  UiNumberFilterOperator,
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

export function getOptionByOperator(operator: UiNumberFilterOperator) {
  return OPERATOR_OPTIONS[operator];
}

export function getDefaultOperator(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  availableOptions: OperatorOption[],
): UiNumberFilterOperator {
  const fieldValuesInfo = Lib.fieldValuesSearchInfo(query, column);

  const desiredOperator =
    Lib.isPrimaryKey(column) ||
    Lib.isForeignKey(column) ||
    fieldValuesInfo.hasFieldValues !== "none"
      ? "="
      : "between";

  return getDefaultAvailableOperator(availableOptions, desiredOperator);
}

export function getDefaultValues(
  operator: UiNumberFilterOperator,
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
  operator: UiNumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, column, values) != null;
}

export function getFilterClause(
  operator: UiNumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
  options?: Lib.NumberFilterOptions,
) {
  const filterParts = getFilterParts(operator, column, values, options);
  return filterParts != null ? Lib.numberFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: UiNumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
  options?: Lib.NumberFilterOptions,
): Lib.NumberFilterParts | undefined {
  switch (operator) {
    case "between":
      return getBetweenFilterParts(operator, column, values, options);
    default:
      return getSimpleFilterParts(operator, column, values);
  }
}

function getSimpleFilterParts(
  operator: UiNumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.NumberFilterParts | undefined {
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
    values: values.filter(isNotNull),
  };
}

function getBetweenFilterParts(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
  options?: Lib.NumberFilterOptions,
): Lib.NumberFilterParts | undefined {
  const [startValue, endValue] = values;
  const minInclusive = options?.minInclusive ?? true;
  const maxInclusive = options?.maxInclusive ?? true;

  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator,
      column,
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
      values: [startValue],
      options: {
        minInclusive,
      },
    };
  } else if (isNotNull(endValue)) {
    return {
      operator: maxInclusive ? "<=" : "<",
      column,
      values: [endValue],
      options: {
        maxInclusive,
      },
    };
  }
}

export function normalizeNumberFilterParts({
  operator,
  column,
  values,
}: Lib.NumberFilterParts) {
  if (operator === ">") {
    return {
      operator: "between" as const,
      column,
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
    values,
  };
}
