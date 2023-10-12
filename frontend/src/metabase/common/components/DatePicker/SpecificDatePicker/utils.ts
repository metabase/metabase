import moment from "moment-timezone";
import type {
  DatePickerOperator,
  SpecificDatePickerOperator,
  SpecificDatePickerValue,
} from "../types";
import { TABS } from "./constants";
import type { Tab } from "./types";

export function getTabs(
  availableOperators: ReadonlyArray<DatePickerOperator>,
): Tab[] {
  return TABS.filter(tab => availableOperators.includes(tab.operator));
}

export function getDefaultValue(): SpecificDatePickerValue {
  const today = moment().startOf("date").toDate();

  return {
    type: "specific",
    operator: "between",
    values: [today, today],
  };
}

export function setOperator(
  value: SpecificDatePickerValue,
  operator: SpecificDatePickerOperator,
): SpecificDatePickerValue {
  switch (operator) {
    case "=":
    case "<":
      return value.operator === "between"
        ? { ...value, operator, values: [value.values[1]] }
        : { ...value, operator, values: [value.values[0]] };
    case ">":
      return { ...value, operator, values: [value.values[0]] };
    case "between":
      return { ...value, operator, values: [value.values[0], value.values[0]] };
  }
}

export function getDate(value: SpecificDatePickerValue) {
  return value.values[0];
}

export function setDate(value: SpecificDatePickerValue, date: Date) {
  return { ...value, values: [date] };
}

export function setDateRange(
  value: SpecificDatePickerValue,
  dates: [Date, Date],
) {
  return { ...value, values: dates };
}

export function isDateRange(value: Date[]): value is [Date, Date] {
  return value.length === 2;
}
