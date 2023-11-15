import type {
  DatePickerOperator,
  DatePickerValue,
} from "metabase/common/components/DatePicker";
import { OPERATOR_OPTIONS } from "./constants";
import type { OperatorOption, OperatorType } from "./types";

export function getAvailableOperators(
  availableOperators: ReadonlyArray<DatePickerOperator>,
): OperatorOption[] {
  return OPERATOR_OPTIONS.filter(
    option =>
      option.operators.length === 0 ||
      option.operators.some(operator => availableOperators.includes(operator)),
  );
}

export function getOperatorType(
  value: DatePickerValue | undefined,
): OperatorType {
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
