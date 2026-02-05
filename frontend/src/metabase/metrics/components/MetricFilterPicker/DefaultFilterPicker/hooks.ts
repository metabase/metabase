import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import type { FilterOperatorOption } from "../types";

type DefaultFilterOperatorOption =
  FilterOperatorOption<Lib.DefaultFilterOperator>;

type DefaultFilterOperatorInfo = {
  operator: Lib.DefaultFilterOperator;
};

const OPERATORS: Record<Lib.DefaultFilterOperator, DefaultFilterOperatorInfo> =
  {
    "is-null": {
      operator: "is-null",
    },
    "not-null": {
      operator: "not-null",
    },
  };

function getAvailableOptions(): DefaultFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator),
  }));
}

function getDefaultOperator(
  hasInitialOperator: boolean,
): Lib.DefaultFilterOperator | undefined {
  return hasInitialOperator ? "is-null" : undefined;
}

function getFilterClause(
  operator: Lib.DefaultFilterOperator | undefined,
  dimension: LibMetric.DimensionMetadata,
) {
  if (operator) {
    return LibMetric.defaultFilterClause({ operator, dimension });
  }
}

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
