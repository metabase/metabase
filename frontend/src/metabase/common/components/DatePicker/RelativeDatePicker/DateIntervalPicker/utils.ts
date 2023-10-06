import * as Lib from "metabase-lib";
import type { DatePickerTruncationUnit } from "../../types";
import type { RelativeDateIntervalValue } from "../types";

export function setUnit(
  value: RelativeDateIntervalValue,
  unit: DatePickerTruncationUnit,
): RelativeDateIntervalValue {
  return { ...value, unit };
}

export function getIncludeCurrent(value: RelativeDateIntervalValue): boolean {
  return value.options?.["include-current"] ?? false;
}

export function getIncludeCurrentLabel(unit: DatePickerTruncationUnit): string {
  return Lib.describeTemporalInterval("current", unit).toLowerCase();
}

export function setIncludeCurrent(
  value: RelativeDateIntervalValue,
  includeCurrent: boolean,
): RelativeDateIntervalValue {
  return { ...value, options: { "include-current": includeCurrent } };
}
