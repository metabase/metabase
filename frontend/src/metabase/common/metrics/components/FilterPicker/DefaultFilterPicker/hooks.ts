import { useMemo, useState } from "react";

import type * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import {
  getAvailableOptions,
  getDefaultOperator,
  getFilterClause,
} from "./utils";

interface UseDefaultFilterProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
  hasInitialOperator?: boolean;
}

export function useDefaultFilter({
  definition,
  dimension,
  filter,
  hasInitialOperator = false,
}: UseDefaultFilterProps) {
  const filterParts = useMemo(
    () => (filter ? LibMetric.defaultFilterParts(definition, filter) : null),
    [definition, filter],
  );

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(hasInitialOperator),
  );

  return {
    operator,
    availableOptions,
    getFilterClause: (operator: Lib.DefaultFilterOperator | undefined) =>
      getFilterClause(operator, dimension),
    setOperator,
  };
}
