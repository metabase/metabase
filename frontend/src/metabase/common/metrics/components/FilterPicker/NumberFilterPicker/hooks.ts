import { useMemo, useState } from "react";

import type * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import type { NumberOrEmptyValue } from "./types";
import {
  getAvailableOptions,
  getDefaultOperator,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseNumberFilterProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
}

export function useNumberFilter({
  definition,
  dimension,
  filter,
}: UseNumberFilterProps) {
  const filterParts = useMemo(
    () => (filter ? LibMetric.numberFilterParts(definition, filter) : null),
    [definition, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(dimension),
    [dimension],
  );

  const [operator, setOperator] = useState(() =>
    filterParts
      ? filterParts.operator
      : getDefaultOperator(definition, dimension),
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, dimension, values);

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
    ) => getFilterClause(operator, dimension, values),
    setOperator,
    setValues,
  };
}
