import {
  isDatePickerExtractionUnit,
  isDatePickerOperator,
} from "metabase/common/components/DatePicker";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerValue,
  ExcludeDatePickerValue,
  RelativeDatePickerValue,
} from "metabase/common/components/DatePicker";
import * as Lib from "metabase-lib";

export function getPickerValue(
  query: Lib.Query,
  stageIndex: number,
  filterClause: Lib.FilterClause,
): DatePickerValue | undefined {
  return (
    getRelativeDateValue(query, stageIndex, filterClause) ??
    getExcludeDateValue(query, stageIndex, filterClause)
  );
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
    unit: filterParts.bucket,
    value: filterParts.value,
    offsetUnit: filterParts.offsetBucket,
    offsetValue: filterParts.offsetValue,
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
    unit: filterParts.bucket,
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
    case "relative":
      return getRelativeFilterClause(query, stageIndex, column, value);
    case "exclude":
      return getExcludeFilterClause(query, stageIndex, column, value);
  }
}

function getRelativeFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  value: RelativeDatePickerValue,
): Lib.ExpressionClause {
  return Lib.relativeDateFilterClause({
    column,
    bucket: value.unit,
    value: value.value,
    offsetBucket: value.offsetUnit,
    offsetValue: value.offsetValue,
    options: {},
  });
}

function getExcludeFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  value: ExcludeDatePickerValue,
): Lib.ExpressionClause {
  return Lib.excludeDateFilterClause(query, stageIndex, {
    operator: value.operator,
    bucket: value.unit,
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
): DatePickerExtractionUnit[] {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map(operator => Lib.displayInfo(query, stageIndex, operator).shortName)
    .filter(isDatePickerExtractionUnit);
}
