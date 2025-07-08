import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import type { NumberOrEmptyValue, UiFilterOperator } from "./types";
import {
  getAvailableOptions,
  getDefaultOperator,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

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
  const filterParts = useMemo(() => {
    if (!filter) {
      return null;
    }

    const filterParts = Lib.numberFilterParts(query, stageIndex, filter);
    if (!filterParts) {
      return null;
    }

    const sugaredFilterParts = normalizeFilterParts(filterParts);

    return sugaredFilterParts;
  }, [query, stageIndex, filter]);

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(() =>
    filterParts
      ? (filterParts.operator as UiFilterOperator) // temp, will be fixed in metabase#60550
      : getDefaultOperator(query, column, availableOptions),
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
      operator: UiFilterOperator,
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}

function normalizeFilterParts({
  operator,
  column,
  values,
}: Lib.NumberFilterParts) {
  if (operator === ">") {
    return {
      operator: "between" as const,
      column,
      values: [values[0], null],
      options: {
        minInclusive: false,
        maxInclusive: false,
      },
    };
  }

  if (operator === "<") {
    return {
      operator: "between" as const,
      column,
      values: [null, values[0]],
      options: {
        minInclusive: false,
        maxInclusive: false,
      },
    };
  }

  if (operator === "<=") {
    return {
      operator: "between" as const,
      column,
      values: [null, values[0]],
      options: {
        minInclusive: false,
        maxInclusive: true,
      },
    };
  }

  if (operator === ">=") {
    return {
      operator: "between" as const,
      column,
      values: [values[0], null],
      options: {
        minInclusive: true,
        maxInclusive: false,
      },
    };
  }

  return {
    operator,
    column,
    values,
  };
}
