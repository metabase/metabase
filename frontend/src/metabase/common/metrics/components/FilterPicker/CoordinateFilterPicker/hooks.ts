import { useMemo, useState } from "react";

import type * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import type { NumberOrEmptyValue } from "./types";
import {
  canPickDimensions,
  getAvailableDimensions,
  getAvailableOptions,
  getDefaultOperator,
  getDefaultSecondDimension,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseCoordinateFilterProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
}

export function useCoordinateFilter({
  definition,
  dimension,
  filter,
}: UseCoordinateFilterProps) {
  const filterParts = useMemo(
    () => (filter ? LibMetric.coordinateFilterParts(definition, filter) : null),
    [definition, filter],
  );

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const availableDimensions = useMemo(
    () => getAvailableDimensions(definition, dimension),
    [definition, dimension],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(),
  );
  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );
  const [secondDimension, setSecondDimension] = useState(
    getDefaultSecondDimension(availableDimensions, filterParts),
  );

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, dimension, secondDimension, values);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    availableDimensions,
    secondDimension,
    canPickDimensions: canPickDimensions(operator, availableDimensions),
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.CoordinateFilterOperator,
      secondDimension: LibMetric.DimensionMetadata | undefined,
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, dimension, secondDimension, values),
    setOperator,
    setValues,
    setSecondDimension,
  };
}
