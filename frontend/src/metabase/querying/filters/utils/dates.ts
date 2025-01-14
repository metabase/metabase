import dayjs from "dayjs";
import { match } from "ts-pattern";
import { c, msgid, ngettext, t } from "ttag";

import {
  DATE_PICKER_EXTRACTION_UNITS,
  DATE_PICKER_OPERATORS,
  DATE_PICKER_TRUNCATION_UNITS,
} from "metabase/querying/filters/constants";
import type {
  DateFilterDisplayOpts,
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
} from "metabase/querying/filters/types";
import type { ExcludeDateFilterUnit } from "metabase-lib";
import * as Lib from "metabase-lib";

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

export function getDatePickerOperators(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): DatePickerOperator[] {
  return Lib.filterableColumnOperators(column)
    .map(operator => Lib.displayInfo(query, stageIndex, operator).shortName)
    .filter(isDatePickerOperator);
}

export function getDatePickerUnits(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): DatePickerUnit[] {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map(operator => Lib.displayInfo(query, stageIndex, operator).shortName)
    .filter(isDatePickerUnit);
}

export function getDatePickerValue(
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

export function getDateFilterDisplayName(
  value: DateFilterValue,
  { withPrefix }: DateFilterDisplayOpts = {},
) {
  return match(value)
    .with(
      { type: "specific", operator: "=" },
      ({ values: [date], hasTime }) => {
        const dateText = formatDate(date, hasTime);
        return withPrefix
          ? c("On a date. Example: On Jan 20.").t`On ${dateText}`
          : dateText;
      },
    )
    .with(
      { type: "specific", operator: "<" },
      ({ values: [date], hasTime }) => {
        return c("Before a date. Example: Before Jan 20.")
          .t`Before ${formatDate(date, hasTime)}`;
      },
    )
    .with(
      { type: "specific", operator: ">" },
      ({ values: [date], hasTime }) => {
        return c("After a date. Example: After Jan 20.")
          .t`After ${formatDate(date, hasTime)}`;
      },
    )
    .with(
      { type: "specific", operator: "between" },
      ({ values: [startDate, endDate], hasTime }) => {
        return `${formatDate(startDate, hasTime)} - ${formatDate(endDate, hasTime)}`;
      },
    )
    .with({ type: "relative" }, ({ value, unit, offsetValue, offsetUnit }) => {
      if (offsetValue != null && offsetUnit != null) {
        const prefix = Lib.describeTemporalInterval(value, unit);
        const suffix = Lib.describeRelativeDatetime(offsetValue, offsetUnit);
        return c(
          "Describes a relative date interval. Example: Previous 2 months, starting 1 year ago.",
        ).t`${prefix}, starting ${suffix}`;
      } else {
        return Lib.describeTemporalInterval(value, unit);
      }
    })
    .with({ type: "exclude", operator: "!=" }, ({ values, unit }) => {
      if (values.length <= 2 && unit != null) {
        const parts = values.map(value => formatExcludeUnit(value, unit));
        return t`Exclude ${parts.join(", ")}`;
      } else {
        const count = values.length;
        return ngettext(
          msgid`Exclude ${count} selection`,
          `Exclude ${count} selections`,
          count,
        );
      }
    })
    .with({ type: "exclude", operator: "is-null" }, () => {
      return t`Is empty`;
    })
    .with({ type: "exclude", operator: "not-null" }, () => {
      return t`Not empty`;
    })
    .with({ type: "month" }, ({ month, year }) => {
      return formatMonth(month, year);
    })
    .with({ type: "quarter" }, ({ quarter, year }) => {
      return formatQuarter(quarter, year);
    })
    .exhaustive();
}

function formatDate(date: Date, hasTime: boolean) {
  return hasTime
    ? dayjs(date).format("MMMM D, YYYY hh:mm A")
    : dayjs(date).format("MMMM D, YYYY");
}

function formatMonth(month: number, year: number) {
  return dayjs()
    .year(year)
    .month(month - 1)
    .format("MMMM YYYY");
}

function formatQuarter(quarter: number, year: number) {
  return dayjs()
    .year(year)
    .quarter(quarter)
    .format(
      c(
        'This is a "dayjs" format string (https://day.js.org/docs/en/plugin/advanced-format). It should include "Q" for the quarter number, YYYY for the year, and raw text can be escaped by brackets. For example, "[Quarter] Q YYYY" will be rendered as "Quarter 1 2024".',
      ).t`[Q]Q YYYY`,
    );
}

function formatExcludeUnit(value: number, unit: ExcludeDateFilterUnit) {
  switch (unit) {
    case "hour-of-day":
      return dayjs().hour(value).format("h A");
    case "day-of-week":
      return dayjs().isoWeekday(value).format("dddd");
    case "month-of-year":
      return dayjs()
        .month(value - 1)
        .format("MMMM");
    case "quarter-of-year":
      return dayjs()
        .quarter(value)
        .format(
          c(
            'This is a "dayjs" format string (https://day.js.org/docs/en/plugin/advanced-format). It should include "Q" for the quarter number, and raw text can be escaped by brackets. For example, "[Quarter] Q" will be rendered as "Quarter 1".',
          ).t`[Q]Q`,
        );
  }
}
