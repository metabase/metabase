import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";

export function getCurrentValue(
  unit: DatePickerTruncationUnit,
): RelativeDatePickerValue {
  return {
    type: "relative",
    unit,
    value: "current",
    offsetUnit: null,
    offsetValue: null,
  };
}
