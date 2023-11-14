import type {
  DatePickerOperator,
  DatePickerValue,
} from "metabase/common/components/DatePicker";
import { OPTIONS } from "./constants";
import type { Option, OptionType } from "./types";

export function getAvailableOptions(
  availableOperators: ReadonlyArray<DatePickerOperator>,
): Option[] {
  return OPTIONS.filter(
    option =>
      option.operators.length === 0 ||
      option.operators.some(operator => availableOperators.includes(operator)),
  );
}

export function getOptionType(value: DatePickerValue | undefined): OptionType {
  switch (value?.type) {
    case "specific":
      return value.operator;
    case "relative":
      if (value.value === "current") {
        return "current";
      } else {
        return value.value < 0 ? "last" : "next";
      }
    case "exclude":
      if (value.operator !== "!=") {
        return value.operator;
      } else {
        return "none";
      }
    default:
      return "none";
  }
}
