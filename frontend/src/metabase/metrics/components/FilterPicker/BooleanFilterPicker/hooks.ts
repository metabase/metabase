import { useState } from "react";

import type * as LibMetric from "metabase-lib/metric";

import { getFilterClause, getFilterValue } from "./utils";

interface UseBooleanFilterProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
}

export function useBooleanFilter({
  definition,
  dimension,
  filter,
}: UseBooleanFilterProps) {
  const [value, setValue] = useState(() => getFilterValue(definition, filter));

  return {
    value,
    getFilterClause: () => getFilterClause(dimension, value),
    setValue,
  };
}
