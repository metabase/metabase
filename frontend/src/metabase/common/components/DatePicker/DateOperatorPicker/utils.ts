import type {
  DatePickerOperator,
  DatePickerValue,
} from "metabase/common/components/DatePicker";
import {
  setOperator,
  getOperatorDefaultValue,
} from "../SpecificDatePicker/utils";
import {
  getDirectionDefaultValue,
  setDirectionAndCoerceUnit,
} from "../RelativeDatePicker/utils";
import { getExcludeOperatorValue } from "../ExcludeDatePicker/utils";
import { OPERATOR_OPTIONS } from "./constants";
import type { OperatorOption, OptionType } from "./types";

export function getAvailableOptions(
  availableOperators: ReadonlyArray<DatePickerOperator>,
): OperatorOption[] {
  return OPERATOR_OPTIONS.filter(
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

export function setOptionType(
  value: DatePickerValue | undefined,
  optionType: OptionType,
): DatePickerValue | undefined {
  switch (optionType) {
    case "=":
    case ">":
    case "<":
    case "between":
      return value?.type === "specific"
        ? setOperator(value, optionType)
        : getOperatorDefaultValue(optionType);
    case "last":
    case "next":
    case "current":
      return value?.type === "relative"
        ? setDirectionAndCoerceUnit(value, optionType)
        : getDirectionDefaultValue(optionType);
    case "is-null":
    case "not-null":
      return getExcludeOperatorValue(optionType);
    default:
      return undefined;
  }
}
