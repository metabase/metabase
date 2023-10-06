import * as Lib from "metabase-lib";
import type { DatePickerTruncationUnit } from "../../types";
import type { RelativeDateIntervalValue } from "../types";
import { DATE_PICKER_TRUNCATION_UNITS } from "../../constants";

export function getInterval(value: RelativeDateIntervalValue): number {
  return Math.abs(value.value);
}

export function setInterval(
  value: RelativeDateIntervalValue,
  interval: number,
): RelativeDateIntervalValue {
  const sign = Math.sign(value.value);

  return {
    ...value,
    value: Math.max(Math.abs(Math.floor(interval)), 1) * sign,
  };
}

export function setUnit(
  value: RelativeDateIntervalValue,
  unit: DatePickerTruncationUnit,
): RelativeDateIntervalValue {
  return { ...value, unit };
}

export function getIncludeCurrent(value: RelativeDateIntervalValue): boolean {
  return value.options?.["include-current"] ?? false;
}

export function setIncludeCurrent(
  value: RelativeDateIntervalValue,
  includeCurrent: boolean,
): RelativeDateIntervalValue {
  return { ...value, options: { "include-current": includeCurrent } };
}

export function getUnitLabel(unit: DatePickerTruncationUnit): string {
  return Lib.describeTemporalInterval("current", unit).toLowerCase();
}

export function getUnitOptions(interval: number) {
  return DATE_PICKER_TRUNCATION_UNITS.map(unit => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit, interval).toLowerCase(),
  }));
}
