import { useMemo, useState } from "react";

import type { FilterOperatorOption } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

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
  column: Lib.ColumnMetadata,
) {
  if (operator) {
    return Lib.defaultFilterClause({ operator, column });
  }
}

interface UseDefaultFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
  hasInitialOperator?: boolean;
}

export function useDefaultFilter({
  query,
  stageIndex,
  column,
  filter,
  hasInitialOperator = false,
}: UseDefaultFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.defaultFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(hasInitialOperator),
  );

  return {
    operator,
    availableOptions,
    getFilterClause: (operator: Lib.DefaultFilterOperator | undefined) =>
      getFilterClause(operator, column),
    setOperator,
  };
}
