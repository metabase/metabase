import { useMemo, useState } from "react";

import type * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import {
  getAvailableOptions,
  getDefaultOperator,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseStringFilterProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
}

export function useStringFilter({
  definition,
  dimension,
  filter,
}: UseStringFilterProps) {
  const filterParts = useMemo(
    () => (filter ? LibMetric.stringFilterParts(definition, filter) : null),
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

  const [options, setOptions] = useState(
    filterParts ? filterParts.options : { caseSensitive: false },
  );

  const { type } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, dimension, values, options);

  return {
    type,
    operator,
    availableOptions,
    values,
    options,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.StringFilterOperator,
      values: string[],
      options: LibMetric.StringFilterOptions,
    ) => getFilterClause(operator, dimension, values, options),
    setOperator,
    setValues,
    setOptions,
  };
}
