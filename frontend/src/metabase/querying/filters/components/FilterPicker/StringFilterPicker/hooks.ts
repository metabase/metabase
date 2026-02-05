import { useMemo, useState } from "react";

import type { FilterOperatorOption } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

export type OperatorType = "exact" | "partial" | "empty";

type StringFilterOperatorOption =
  FilterOperatorOption<Lib.StringFilterOperator>;

type StringFilterOperatorInfo = {
  operator: Lib.StringFilterOperator;
  type: OperatorType;
};

const OPERATORS: Record<Lib.StringFilterOperator, StringFilterOperatorInfo> = {
  "=": {
    operator: "=",
    type: "exact",
  },
  "!=": {
    operator: "!=",
    type: "exact",
  },
  contains: {
    operator: "contains",
    type: "partial",
  },
  "does-not-contain": {
    operator: "does-not-contain",
    type: "partial",
  },
  "starts-with": {
    operator: "starts-with",
    type: "partial",
  },
  "ends-with": {
    operator: "ends-with",
    type: "partial",
  },
  "is-empty": {
    operator: "is-empty",
    type: "empty",
  },
  "not-empty": {
    operator: "not-empty",
    type: "empty",
  },
};

function isNotEmpty(value: string) {
  return value.length > 0;
}

function getAvailableOptions(
  column: Lib.ColumnMetadata,
): StringFilterOperatorOption[] {
  const isStringLike = Lib.isStringLike(column);

  return Object.values(OPERATORS)
    .filter(({ type }) => !isStringLike || type !== "partial")
    .map(({ operator }) => ({
      operator,
      displayName: Lib.describeFilterOperator(operator),
    }));
}

function getOptionByOperator(operator: Lib.StringFilterOperator) {
  return OPERATORS[operator];
}

function getDefaultOperator(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): Lib.StringFilterOperator {
  const fieldValuesInfo = Lib.fieldValuesSearchInfo(query, column);

  if (
    Lib.isPrimaryKey(column) ||
    Lib.isForeignKey(column) ||
    Lib.isStringLike(column) ||
    fieldValuesInfo.hasFieldValues !== "none"
  ) {
    return "=";
  }

  return "contains";
}

export function getDefaultValues(
  operator: Lib.StringFilterOperator,
  values: string[],
): string[] {
  const { type } = OPERATORS[operator];
  return type !== "empty" ? values.filter(isNotEmpty) : [];
}

function isValidFilter(
  operator: Lib.StringFilterOperator,
  column: Lib.ColumnMetadata,
  values: string[] = [],
  options: Lib.StringFilterOptions,
) {
  return getFilterParts(operator, column, values, options) != null;
}

function getFilterClause(
  operator: Lib.StringFilterOperator,
  column: Lib.ColumnMetadata,
  values: string[],
  options: Lib.StringFilterOptions,
) {
  const filterParts = getFilterParts(operator, column, values, options);
  return filterParts != null ? Lib.stringFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: Lib.StringFilterOperator,
  column: Lib.ColumnMetadata,
  values: string[],
  options: Lib.StringFilterOptions,
): Lib.StringFilterParts | undefined {
  const { type } = OPERATORS[operator];
  if (values.length === 0 && type !== "empty") {
    return undefined;
  }

  return {
    operator,
    column,
    values,
    options,
  };
}

interface UseStringFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
}

export function useStringFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseStringFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.stringFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(() => getAvailableOptions(column), [column]);

  const [operator, setOperator] = useState(() =>
    filterParts ? filterParts.operator : getDefaultOperator(query, column),
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );

  const [options, setOptions] = useState(
    filterParts ? filterParts.options : { caseSensitive: false },
  );

  const { type } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values, options);

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
      options: Lib.StringFilterOptions,
    ) => getFilterClause(operator, column, values, options),
    setOperator,
    setValues,
    setOptions,
  };
}
