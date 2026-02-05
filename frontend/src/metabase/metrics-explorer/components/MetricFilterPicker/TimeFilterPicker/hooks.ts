import { useMemo, useState } from "react";

import type * as LibMetric from "metabase-lib/metric";

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
  dimension: LibMetric.DimensionMetadata;
}

export function useTimeFilter({ dimension }: UseTimeFilterProps) {
  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const [operator, setOperator] = useState(getDefaultOperator());
  const [values, setValues] = useState(() => getDefaultValues(operator, []));
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
