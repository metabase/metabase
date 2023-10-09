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
    operator: "=",
    values: [today],
  };
}

export function setOperator(
  value: SpecificDatePickerValue,
  operator: SpecificDatePickerOperator,
): SpecificDatePickerValue {
  switch (operator) {
    case "=":
    case "<":
    case ">":
      return { ...value, operator, values: [value.values[0]] };
    case "between":
      return { ...value, operator, values: [value.values[0], value.values[0]] };
  }
}
