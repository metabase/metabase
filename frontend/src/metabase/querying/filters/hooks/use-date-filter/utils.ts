import * as Lib from "metabase-lib";

import {
  type DatePickerOperator,
  type DatePickerUnit,
  type DatePickerValue,
  type ExcludeDatePickerValue,
  type RelativeDatePickerValue,
  type SpecificDatePickerValue,
  isDatePickerOperator,
  isDatePickerUnit,
} from "../../components/DatePicker";

export function getPickerValue(
  query: Lib.Query,
  stageIndex: number,
  filterClause: Lib.FilterClause,
): DatePickerValue | undefined {
  return (
    getSpecificDateValue(query, stageIndex, filterClause) ??
    getRelativeDateValue(query, stageIndex, filterClause) ??
    getExcludeDateValue(query, stageIndex, filterClause)
  );
}

function getSpecificDateValue(
  query: Lib.Query,
  stageIndex: number,
  filterClause: Lib.FilterClause,
): SpecificDatePickerValue | undefined {
  const filterParts = Lib.specificDateFilterParts(
    query,
    stageIndex,
    filterClause,
  );
  if (filterParts == null) {
    return undefined;
  }

  return {
    type: "specific",
    operator: filterParts.operator,
    values: filterParts.values,
    hasTime: filterParts.hasTime,
  };
}

function getRelativeDateValue(
  query: Lib.Query,
  stageIndex: number,
  filterClause: Lib.FilterClause,
): RelativeDatePickerValue | undefined {
  const filterParts = Lib.relativeDateFilterParts(
    query,
    stageIndex,
    filterClause,
  );
  if (filterParts == null) {
    return undefined;
  }

  return {
    type: "relative",
    unit: filterParts.unit,
    value: filterParts.value,
    offsetUnit: filterParts.offsetUnit ?? undefined,
    offsetValue: filterParts.offsetValue ?? undefined,
    options: filterParts.options,
  };
}

function getExcludeDateValue(
  query: Lib.Query,
  stageIndex: number,
  filterClause: Lib.FilterClause,
): ExcludeDatePickerValue | undefined {
  const filterParts = Lib.excludeDateFilterParts(
    query,
    stageIndex,
    filterClause,
  );
  if (filterParts == null) {
    return undefined;
  }

  return {
    type: "exclude",
    operator: filterParts.operator,
    unit: filterParts.unit ?? undefined,
    values: filterParts.values,
  };
}

export function getFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  value: DatePickerValue,
): Lib.ExpressionClause {
  switch (value.type) {
    case "specific":
      return getSpecificFilterClause(query, stageIndex, column, value);
    case "relative":
      return getRelativeFilterClause(column, value);
    case "exclude":
      return getExcludeFilterClause(query, stageIndex, column, value);
  }
}

function getSpecificFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  value: SpecificDatePickerValue,
): Lib.ExpressionClause {
  return Lib.specificDateFilterClause(query, stageIndex, {
    operator: value.operator,
    column,
    values: value.values,
    hasTime: value.hasTime,
  });
}

function getRelativeFilterClause(
  column: Lib.ColumnMetadata,
  value: RelativeDatePickerValue,
): Lib.ExpressionClause {
  return Lib.relativeDateFilterClause({
    column,
    unit: value.unit,
    value: value.value,
    offsetUnit: value.offsetUnit ?? null,
    offsetValue: value.offsetValue ?? null,
    options: value.options ?? {},
  });
}

function getExcludeFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  value: ExcludeDatePickerValue,
): Lib.ExpressionClause {
  return Lib.excludeDateFilterClause({
    operator: value.operator,
    unit: value.unit ?? null,
    column,
    values: value.values,
  });
}

export function getPickerOperators(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): DatePickerOperator[] {
  return Lib.filterableColumnOperators(column)
    .map(operator => Lib.displayInfo(query, stageIndex, operator).shortName)
    .filter(isDatePickerOperator);
}

export function getPickerUnits(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): DatePickerUnit[] {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map(operator => Lib.displayInfo(query, stageIndex, operator).shortName)
    .filter(isDatePickerUnit);
}
