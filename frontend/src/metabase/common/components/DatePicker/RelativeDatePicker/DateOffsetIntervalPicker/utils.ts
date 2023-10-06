import type { DatePickerTruncationUnit } from "../../types";
import type { DateOffsetIntervalValue } from "../types";

export function setUnit(
  value: DateOffsetIntervalValue,
  unit: DatePickerTruncationUnit,
): DateOffsetIntervalValue {
  return { ...value, unit, offsetUnit: unit };
}

export function setOffsetInterval(
  value: DateOffsetIntervalValue,
  offsetValue: number,
): DateOffsetIntervalValue {
  return { ...value, offsetValue: Math.max(Math.abs(offsetValue), 1) };
}
