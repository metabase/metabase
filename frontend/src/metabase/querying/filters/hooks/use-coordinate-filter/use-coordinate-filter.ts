import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import type {
  NumberOrEmptyValue,
  UiCoordinateFilterOperator,
  UiCoordinateFilterParts,
} from "./types";
import {
  canPickColumns,
  getAvailableColumns,
  getAvailableOptions,
  getDefaultOperator,
  getDefaultSecondColumn,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseCoordinateFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
}

export function useCoordinateFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseCoordinateFilterProps) {
  const filterParts = useMemo(() => {
    if (!filter) {
      return null;
    }

    const filterParts = Lib.coordinateFilterParts(query, stageIndex, filter);

    if (!filterParts) {
      return null;
    }

    const normalizedFilterParts = normalizeCoordinateFilterParts(filterParts);

    return normalizedFilterParts;
  }, [query, stageIndex, filter]);

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const availableColumns = useMemo(
    () => getAvailableColumns(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(availableOptions),
  );
  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );
  const [secondColumn, setSecondColumn] = useState(
    getDefaultSecondColumn(availableColumns, filterParts),
  );

  const [options, setOptions] = useState<Lib.CoordinateFilterOptions>(
    filterParts?.options ?? {
      minInclusive: true,
      maxInclusive: true,
    },
  );

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, secondColumn, values);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    availableColumns,
    secondColumn,
    canPickColumns: canPickColumns(operator, availableColumns),
    isValid,
    inclusiveOptions: options,
    getDefaultValues,
    getFilterClause: (
      operator: UiCoordinateFilterOperator,
      secondColumn: Lib.ColumnMetadata | undefined,
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, column, secondColumn, values),
    setOperator,
    setValues,
    setSecondColumn,
    setInclusiveOptions: setOptions,
  };
}

function normalizeCoordinateFilterParts({
  operator,
  column,
  longitudeColumn,
  values,
}: Lib.CoordinateFilterParts): UiCoordinateFilterParts {
  if (operator === ">") {
    return {
      operator: "between" as const,
      column,
      longitudeColumn,
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
      longitudeColumn,
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
      longitudeColumn,
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
      longitudeColumn,
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
    longitudeColumn,
    values,
  };
}
