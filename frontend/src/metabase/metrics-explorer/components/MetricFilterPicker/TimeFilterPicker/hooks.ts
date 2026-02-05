import { useMemo, useState } from "react";

import * as LibMetric from "metabase-lib/metric";

import type { TimeValue } from "./types";
import {
  getAvailableOptions,
  getDefaultOperator,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseTimeFilterProps {
  definition: LibMetric.MetricDefinition;
  source: LibMetric.SourceMetadata;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
}

export function useTimeFilter({
  definition,
  source,
  dimension,
  filter,
}: UseTimeFilterProps) {
  const filterParts = useMemo(() => {
    return filter
      ? LibMetric.timeFilterParts(definition, source, filter)
      : null;
  }, [definition, source, filter]);

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(),
  );
  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );
  const { valueCount } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, dimension, values);

  return {
    operator,
    values,
    valueCount,
    availableOptions,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: LibMetric.TimeFilterOperator,
      values: TimeValue[],
    ) => getFilterClause(operator, dimension, values),
    setOperator,
    setValues,
  };
}
