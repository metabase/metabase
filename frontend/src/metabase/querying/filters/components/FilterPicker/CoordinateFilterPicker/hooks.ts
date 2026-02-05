import { useMemo, useState } from "react";

import { isNotNull } from "metabase/lib/types";
import type { FilterOperatorOption } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

type CoordinatePickerOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | "inside"
  | ">="
  | "<=";

type CoordinateFilterOperatorOption =
  FilterOperatorOption<CoordinatePickerOperator>;

type CoordinateFilterOperatorInfo = {
  operator: CoordinatePickerOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
};

export type NumberOrEmptyValue = Lib.NumberFilterValue | null;

const OPERATORS: Record<
  Lib.CoordinateFilterOperator,
  CoordinateFilterOperatorInfo
> = {
  "=": {
    operator: "=",
    valueCount: 1,
    hasMultipleValues: true,
  },
  "!=": {
    operator: "!=",
    valueCount: 1,
    hasMultipleValues: true,
  },
  inside: {
    operator: "inside",
    valueCount: 4,
  },
  ">": {
    operator: ">",
    valueCount: 1,
  },
  "<": {
    operator: "<",
    valueCount: 1,
  },
  between: {
    operator: "between",
    valueCount: 2,
  },
  ">=": {
    operator: ">=",
    valueCount: 1,
  },
  "<=": {
    operator: "<=",
    valueCount: 1,
  },
};

function getAvailableOptions(): CoordinateFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator),
  }));
}

function getOptionByOperator(operator: Lib.CoordinateFilterOperator) {
  return OPERATORS[operator];
}

function getDefaultOperator(): Lib.CoordinateFilterOperator {
  return "between";
}

function getAvailableColumns(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const isLatitude = Lib.isLatitude(column);
  const isLongitude = Lib.isLongitude(column);
  return Lib.filterableColumns(query, stageIndex).filter(
    (column) =>
      (isLatitude && Lib.isLongitude(column)) ||
      (isLongitude && Lib.isLatitude(column)),
  );
}

function getDefaultSecondColumn(
  columns: Lib.ColumnMetadata[],
  filterParts: Lib.CoordinateFilterParts | null,
): Lib.ColumnMetadata | undefined {
  return filterParts?.longitudeColumn ?? columns[0];
}

function canPickColumns(
  operator: Lib.CoordinateFilterOperator,
  columns: Lib.ColumnMetadata[],
) {
  return operator === "inside" && columns.length > 1;
}

export function getDefaultValues(
  operator: Lib.CoordinateFilterOperator,
  values: NumberOrEmptyValue[],
): NumberOrEmptyValue[] {
  const { valueCount, hasMultipleValues } = OPERATORS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotNull);
  }

  return Array(valueCount)
    .fill(null)
    .map((value, index) => values[index] ?? value);
}

function isValidFilter(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, column, secondColumn, values) != null;
}

function getFilterClause(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
) {
  const filterParts = getFilterParts(operator, column, secondColumn, values);
  return filterParts != null
    ? Lib.coordinateFilterClause(filterParts)
    : undefined;
}

function getFilterParts(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  switch (operator) {
    case "between":
      return getBetweenFilterParts(operator, column, values);
    case "inside":
      return getInsideFilterParts(operator, column, secondColumn, values);
    default:
      return getSimpleFilterParts(operator, column, values);
  }
}

function getSimpleFilterParts(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  if (!values.every(isNotNull)) {
    return undefined;
  }
  if (hasMultipleValues ? values.length === 0 : values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    longitudeColumn: null,
    values: values.filter(isNotNull),
  };
}

function getBetweenFilterParts(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator,
      column,
      longitudeColumn: null,
      values: [minValue, maxValue],
    };
  } else if (isNotNull(startValue)) {
    return {
      operator: ">=",
      column,
      longitudeColumn: null,
      values: [startValue],
    };
  } else if (isNotNull(endValue)) {
    return {
      operator: "<=",
      column,
      longitudeColumn: null,
      values: [endValue],
    };
  } else {
    return undefined;
  }
}

function getInsideFilterParts(
  operator: Lib.CoordinateFilterOperator,
  column: Lib.ColumnMetadata,
  secondColumn: Lib.ColumnMetadata | undefined,
  values: NumberOrEmptyValue[],
): Lib.CoordinateFilterParts | undefined {
  if (!values.every(isNotNull)) {
    return undefined;
  }
  if (secondColumn == null) {
    return undefined;
  }

  const isLatitude = Lib.isLatitude(column);
  const [upperLatitude, leftLongitude, lowerLatitude, rightLongitude] = values;

  return {
    operator,
    column: isLatitude ? column : secondColumn,
    longitudeColumn: isLatitude ? secondColumn : column,
    values: [
      lowerLatitude < upperLatitude ? upperLatitude : lowerLatitude,
      leftLongitude < rightLongitude ? leftLongitude : rightLongitude,
      lowerLatitude < upperLatitude ? lowerLatitude : upperLatitude,
      leftLongitude < rightLongitude ? rightLongitude : leftLongitude,
    ],
  };
}

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
  const filterParts = useMemo(
    () =>
      filter ? Lib.coordinateFilterParts(query, stageIndex, filter) : null,
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const availableColumns = useMemo(
    () => getAvailableColumns(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(),
  );
  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );
  const [secondColumn, setSecondColumn] = useState(
    getDefaultSecondColumn(availableColumns, filterParts),
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
    getDefaultValues,
    getFilterClause: (
      operator: Lib.CoordinateFilterOperator,
      secondColumn: Lib.ColumnMetadata | undefined,
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, column, secondColumn, values),
    setOperator,
    setValues,
    setSecondColumn,
  };
}
