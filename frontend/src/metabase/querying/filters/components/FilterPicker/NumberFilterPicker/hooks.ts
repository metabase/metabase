import { useMemo, useState } from "react";

import { isNotNull } from "metabase/lib/types";
import type { FilterOperatorOption } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

type NumberFilterOperatorOption =
  FilterOperatorOption<Lib.NumberFilterOperator>;

type NumberFilterOperatorInfo = {
  operator: Lib.NumberFilterOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
};

export type NumberOrEmptyValue = Lib.NumberFilterValue | null;

const OPERATORS: Record<Lib.NumberFilterOperator, NumberFilterOperatorInfo> = {
  "=": {
    operator: "=",
    valueCount: 1,
    hasMultipleValues: true,
  },
  "!=": {
    operator: "!=",
    valueCount: 1,
    hasMultipleValues: true,
  },
  ">": {
    operator: ">",
    valueCount: 1,
  },
  "<": {
    operator: "<",
    valueCount: 1,
  },
  between: {
    operator: "between",
    valueCount: 2,
  },
  ">=": {
    operator: ">=",
    valueCount: 1,
  },
  "<=": {
    operator: "<=",
    valueCount: 1,
  },
  "is-null": {
    operator: "is-null",
    valueCount: 0,
  },
  "not-null": {
    operator: "not-null",
    valueCount: 0,
  },
};

function getAvailableOptions(
  column: Lib.ColumnMetadata,
): NumberFilterOperatorOption[] {
  const isKey = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
  const variant = isKey ? "default" : "number";

  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator, variant),
  }));
}

function getOptionByOperator(operator: Lib.NumberFilterOperator) {
  return OPERATORS[operator];
}

function getDefaultOperator(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): Lib.NumberFilterOperator {
  const fieldValuesInfo = Lib.fieldValuesSearchInfo(query, column);

  return Lib.isPrimaryKey(column) ||
    Lib.isForeignKey(column) ||
    fieldValuesInfo.hasFieldValues !== "none"
    ? "="
    : "between";
}

export function getDefaultValues(
  operator: Lib.NumberFilterOperator,
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

function isValidFilter(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, column, values) != null;
}

function getFilterClause(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
) {
  const filterParts = getFilterParts(operator, column, values);
  return filterParts != null ? Lib.numberFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.NumberFilterParts | undefined {
  switch (operator) {
    case "between":
      return getBetweenFilterParts(operator, column, values);
    default:
      return getSimpleFilterParts(operator, column, values);
  }
}

function getSimpleFilterParts(
  operator: Lib.NumberFilterOperator,
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
): Lib.NumberFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator,
      column,
      values: [minValue, maxValue],
    };
  } else if (isNotNull(startValue)) {
    return {
      operator: ">=",
      column,
      values: [startValue],
    };
  } else if (isNotNull(endValue)) {
    return {
      operator: "<=",
      column,
      values: [endValue],
    };
  }
}

interface UseNumberFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
}

export function useNumberFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseNumberFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.numberFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(() => getAvailableOptions(column), [column]);

  const [operator, setOperator] = useState(() =>
    filterParts ? filterParts.operator : getDefaultOperator(query, column),
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.NumberFilterOperator,
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
