import * as Lib from "metabase-lib";
import type { DatePickerTruncationUnit } from "../../types";
import type { DateIntervalValue } from "../types";

export function setUnit(
  value: DateIntervalValue,
  unit: DatePickerTruncationUnit,
): DateIntervalValue {
  return { ...value, unit };
}

export function setDefaultOffset(value: DateIntervalValue): DateIntervalValue {
  return { ...value, offsetValue: 1, offsetUnit: value.unit, options: {} };
}

export function getIncludeCurrent(value: DateIntervalValue): boolean {
  return value.options?.["include-current"] ?? false;
}

export function getIncludeCurrentLabel(unit: DatePickerTruncationUnit): string {
  return Lib.describeTemporalInterval("current", unit).toLowerCase();
}

export function setIncludeCurrent(
  value: DateIntervalValue,
  includeCurrent: boolean,
): DateIntervalValue {
  return { ...value, options: { "include-current": includeCurrent } };
}
