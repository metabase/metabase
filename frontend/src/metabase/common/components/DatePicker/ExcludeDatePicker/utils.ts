import _ from "underscore";
import moment from "moment-timezone";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  ExcludeDatePickerValue,
} from "../types";
import { EXCLUDE_UNIT_OPTIONS, EXCLUDE_OPERATOR_OPTIONS } from "./constants";
import type {
  ExcludeOperatorOption,
  ExcludeUnitOption,
  ExcludeValueOption,
} from "./types";

export function getExcludeUnitOptions(
  availableOperators: DatePickerOperator[],
  availableUnits: DatePickerExtractionUnit[],
): ExcludeUnitOption[] {
  if (!availableOperators.includes("!=")) {
    return [];
  }

  return EXCLUDE_UNIT_OPTIONS.filter(option =>
    availableUnits.includes(option.unit),
  );
}

export function getExcludeOperatorOptions(
  availableOperators: DatePickerOperator[],
): ExcludeOperatorOption[] {
  return EXCLUDE_OPERATOR_OPTIONS.filter(option =>
    availableOperators.includes(option.operator),
  );
}

export function findExcludeUnitOption(
  unit: DatePickerExtractionUnit,
): ExcludeUnitOption | undefined {
  return EXCLUDE_UNIT_OPTIONS.find(option => option.unit === unit);
}

export function getExcludeValueOptionGroups(
  unit: DatePickerExtractionUnit,
): ExcludeValueOption[][] {
  switch (unit) {
    case "hour-of-day":
      return [
        _.range(0, 12).map(getExcludeHourOption),
        _.range(12, 24).map(getExcludeHourOption),
      ];
    case "day-of-week":
      return [_.range(1, 8).map(getExcludeDayOption)];
    case "month-of-year":
      return [
        _.range(0, 6).map(getExcludeMonthOption),
        _.range(6, 12).map(getExcludeMonthOption),
      ];
    case "quarter-of-year":
      return [_.range(1, 5).map(getExcludeQuarterOption)];
  }
}

function getExcludeHourOption(hour: number): ExcludeValueOption {
  const date = moment().hour(hour);
  return { value: hour, label: date.format("h A") };
}

function getExcludeDayOption(day: number): ExcludeValueOption {
  const date = moment().isoWeekday(day);
  return { value: day, label: date.format("dddd") };
}

function getExcludeMonthOption(month: number): ExcludeValueOption {
  const date = moment().month(month);
  return { value: month, label: date.format("MMMM") };
}

function getExcludeQuarterOption(quarter: number): ExcludeValueOption {
  const date = moment().quarter(quarter);
  return { value: quarter, label: date.format("Qo") };
}

export function getExcludeOperatorValue(
  operator: DatePickerOperator,
): ExcludeDatePickerValue {
  return {
    type: "exclude",
    operator,
    values: [],
  };
}

export function getExcludeUnitValue(
  unit: DatePickerExtractionUnit,
  values: number[],
): ExcludeDatePickerValue {
  return {
    type: "exclude",
    operator: "!=",
    unit,
    values,
  };
}
