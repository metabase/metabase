import dayjs from "dayjs";
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

export function getDefaultValue() {
  return getOperatorDefaultValue("between");
}

export function getOperatorDefaultValue(
  operator: SpecificDatePickerOperator,
): SpecificDatePickerValue {
  const today = dayjs().startOf("date").toDate();
  const past30Days = dayjs(today).subtract(30, "day").toDate();

  switch (operator) {
    case "between":
      return {
        type: "specific",
        operator,
        values: [past30Days, today],
      };
    case "=":
    case "<":
    case ">":
      return {
        type: "specific",
        operator,
        values: [today],
      };
  }
}

export function setOperator(
  value: SpecificDatePickerValue,
  operator: SpecificDatePickerOperator,
): SpecificDatePickerValue {
  const [date] = value.values;
  const past30Days = dayjs(date).subtract(30, "day").toDate();
  const next30Days = dayjs(date).add(30, "day").toDate();

  switch (operator) {
    case "=":
    case "<":
      return value.operator === "between"
        ? { ...value, operator, values: [value.values[1]] }
        : { ...value, operator, values: [date] };
    case ">":
      return { ...value, operator, values: [date] };
    case "between":
      return value.operator === ">"
        ? { ...value, operator, values: [date, next30Days] }
        : { ...value, operator, values: [past30Days, date] };
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

export function setDatePart(value: Date, date: Date) {
  const newValue = new Date(value);
  newValue.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return newValue;
}

export function setTimePart(value: Date, time: Date) {
  const newValue = new Date(value);
  newValue.setHours(time.getHours(), time.getMinutes());
  return newValue;
}

export function clearTimePart(value: Date) {
  return dayjs(value).startOf("date").toDate();
}

export function hasTimeParts(value: Date) {
  return value.getHours() !== 0 || value.getMinutes() !== 0;
}

export function coerceValue({
  type,
  operator,
  values,
}: SpecificDatePickerValue) {
  if (operator === "between") {
    const [startDate, endDate] = values;

    return {
      type,
      operator,
      values: dayjs(endDate).isBefore(startDate)
        ? [endDate, startDate]
        : [startDate, endDate],
    };
  }

  return { type, operator, values };
}
