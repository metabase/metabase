import dayjs from "dayjs";

import {
  DATE_PICKER_EXTRACTION_UNITS,
  DATE_PICKER_OPERATORS,
  DATE_PICKER_TRUNCATION_UNITS,
} from "metabase/querying/common/constants";
import type {
  DateFilterValue,
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerTruncationUnit,
  DatePickerUnit,
  DatePickerValue,
  ExcludeDatePickerValue,
  MonthYearPickerValue,
  QuarterYearPickerValue,
  RelativeDatePickerValue,
  SpecificDatePickerValue,
} from "metabase/querying/common/types";
import * as Lib from "metabase-lib";

export {
  formatDate,
  getDateFilterDisplayName,
  type DateFilterDisplayOpts,
} from "metabase/querying/common/utils/dates";

export function isDatePickerOperator(
  operator: string,
): operator is DatePickerOperator {
  const operators: ReadonlyArray<string> = DATE_PICKER_OPERATORS;
  return operators.includes(operator);
}

export function isDatePickerUnit(unit: string): unit is DatePickerUnit {
  return isDatePickerTruncationUnit(unit) || isDatePickerExtractionUnit(unit);
}

export function isDatePickerTruncationUnit(
  unit: string,
): unit is DatePickerTruncationUnit {
  const units: ReadonlyArray<string> = DATE_PICKER_TRUNCATION_UNITS;
  return units.includes(unit);
}

export function isDatePickerExtractionUnit(
  unit: string,
): unit is DatePickerExtractionUnit {
  const units: ReadonlyArray<string> = DATE_PICKER_EXTRACTION_UNITS;
  return units.includes(unit);
}

export function getDatePickerUnits(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): DatePickerUnit[] {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map((operator) => Lib.displayInfo(query, stageIndex, operator).shortName)
    .filter(isDatePickerUnit);
}

export function getDatePickerValue(
  query: Lib.Query,
  stageIndex: number,
  filterClause: Lib.Filterable,
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
  filterClause: Lib.Filterable,
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
  filterClause: Lib.Filterable,
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
  filterClause: Lib.Filterable,
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

export function getDateFilterClause(
  column: Lib.ColumnMetadata,
  value: DateFilterValue,
): Lib.ExpressionClause {
  switch (value.type) {
    case "specific":
      return getSpecificFilterClause(column, value);
    case "relative":
      return getRelativeFilterClause(column, value);
    case "exclude":
      return getExcludeFilterClause(column, value);
    case "month":
      return getMonthYearFilterClause(column, value);
    case "quarter":
      return getQuarterYearFilterClause(column, value);
  }
}

function getSpecificFilterClause(
  column: Lib.ColumnMetadata,
  value: SpecificDatePickerValue,
): Lib.ExpressionClause {
  return Lib.specificDateFilterClause({
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

function getMonthYearFilterClause(
  column: Lib.ColumnMetadata,
  value: MonthYearPickerValue,
): Lib.ExpressionClause {
  const startOfMonth = dayjs()
    .year(value.year)
    .month(value.month - 1)
    .startOf("month")
    .toDate();
  const endOfMonth = dayjs(startOfMonth).endOf("month").startOf("day").toDate();

  return Lib.specificDateFilterClause({
    operator: "between",
    column,
    values: [startOfMonth, endOfMonth],
    hasTime: false,
  });
}

function getQuarterYearFilterClause(
  column: Lib.ColumnMetadata,
  value: QuarterYearPickerValue,
): Lib.ExpressionClause {
  const startOfQuarter = dayjs()
    .year(value.year)
    .quarter(value.quarter)
    .startOf("quarter")
    .toDate();
  const endOfQuarter = dayjs(startOfQuarter)
    .endOf("quarter")
    .startOf("day")
    .toDate();

  return Lib.specificDateFilterClause({
    operator: "between",
    column,
    values: [startOfQuarter, endOfQuarter],
    hasTime: false,
  });
}
