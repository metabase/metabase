import dayjs from "dayjs";
import { useMemo, useState } from "react";

import { isNotNull } from "metabase/lib/types";
import type { FilterOperatorOption } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

type TimeFilterOperatorOption = FilterOperatorOption<Lib.TimeFilterOperator>;

type TimeFilterOperatorInfo = {
  operator: Lib.TimeFilterOperator;
  valueCount: number;
};

export type TimeValue = Date | null;

const OPERATORS: Record<Lib.TimeFilterOperator, TimeFilterOperatorInfo> = {
  "<": {
    operator: "<",
    valueCount: 1,
  },
  ">": {
    operator: ">",
    valueCount: 1,
  },
  between: {
    operator: "between",
    valueCount: 2,
  },
  "is-null": {
    operator: "is-null",
    valueCount: 0,
  },
  "not-null": {
    operator: "not-null",
    valueCount: 0,
  },
};

function getAvailableOptions(): TimeFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator, "temporal"),
  }));
}

function getOptionByOperator(operator: Lib.TimeFilterOperator) {
  return OPERATORS[operator];
}

function getDefaultOperator(): Lib.TimeFilterOperator {
  return "<";
}

function getDefaultValue() {
  return dayjs().startOf("day").toDate(); // 00:00:00
}

export function getDefaultValues(
  operator: Lib.TimeFilterOperator,
  values: TimeValue[],
): TimeValue[] {
  const { valueCount } = OPERATORS[operator];

  return Array(valueCount)
    .fill(getDefaultValue())
    .map((value, index) => values[index] ?? value);
}

function isValidFilter(
  operator: Lib.TimeFilterOperator,
  column: Lib.ColumnMetadata,
  values: TimeValue[],
) {
  return getFilterParts(operator, column, values) != null;
}

function getFilterClause(
  operator: Lib.TimeFilterOperator,
  column: Lib.ColumnMetadata,
  values: TimeValue[],
) {
  const filterParts = getFilterParts(operator, column, values);
  if (filterParts == null) {
    return undefined;
  }

  return Lib.timeFilterClause(filterParts);
}

function getFilterParts(
  operator: Lib.TimeFilterOperator,
  column: Lib.ColumnMetadata,
  values: TimeValue[],
): Lib.TimeFilterParts | undefined {
  if (!values.every(isNotNull)) {
    return undefined;
  }

  if (operator === "between") {
    const [startTime, endTime] = values;
    return {
      operator,
      column,
      values: dayjs(endTime).isBefore(startTime)
        ? [endTime, startTime]
        : [startTime, endTime],
    };
  }

  return {
    operator,
    column,
    values,
  };
}

interface UseTimeFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
}

export function useTimeFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseTimeFilterProps) {
  const filterParts = useMemo(() => {
    return filter ? Lib.timeFilterParts(query, stageIndex, filter) : null;
  }, [query, stageIndex, filter]);

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(),
  );
  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );
  const { valueCount } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values);

  return {
    operator,
    values,
    valueCount,
    availableOptions,
    isValid,
    getDefaultValues,
    getFilterClause: (operator: Lib.TimeFilterOperator, values: TimeValue[]) =>
      getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
