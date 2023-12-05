import * as Lib from "metabase-lib";
import { DATE_PICKER_TRUNCATION_UNITS } from "../constants";
import type {
  RelativeIntervalDirection,
  RelativeDatePickerValue,
  DatePickerTruncationUnit,
} from "../types";
import { DEFAULT_VALUE } from "./constants";
import type { DateIntervalValue, DateOffsetIntervalValue } from "./types";

export function isIntervalValue(
  value: RelativeDatePickerValue,
): value is DateIntervalValue {
  return value.value !== "current";
}

export function isOffsetIntervalValue(
  value: RelativeDatePickerValue,
): value is DateOffsetIntervalValue {
  return (
    isIntervalValue(value) &&
    value.offsetValue != null &&
    value.offsetUnit != null
  );
}

export function getDirectionDefaultValue(direction: RelativeIntervalDirection) {
  return setDirectionAndCoerceUnit(DEFAULT_VALUE, direction);
}

export function getDirection(
  value: RelativeDatePickerValue,
): RelativeIntervalDirection {
  if (value.value === "current") {
    return "current";
  } else {
    return value.value < 0 ? "last" : "next";
  }
}

export function setDirection(
  value: RelativeDatePickerValue,
  direction: RelativeIntervalDirection,
  fallbackUnit: DatePickerTruncationUnit = "hour",
): RelativeDatePickerValue {
  if (direction === "current") {
    return { type: "relative", value: "current", unit: fallbackUnit };
  }

  const sign = direction === "last" ? -1 : 1;

  if (!isIntervalValue(value)) {
    return {
      ...value,
      value: Math.abs(DEFAULT_VALUE.value) * sign,
    };
  }

  return {
    ...value,
    value: Math.abs(value.value) * sign,
    offsetValue:
      value.offsetValue != null
        ? Math.abs(value.offsetValue) * sign
        : undefined,
  };
}

export function setDirectionAndCoerceUnit(
  value: RelativeDatePickerValue,
  direction: RelativeIntervalDirection,
) {
  const fallbackUnit =
    value.unit !== "hour" && value.unit !== "minute"
      ? value.unit
      : DEFAULT_VALUE.unit;

  return setDirection(value, direction, fallbackUnit);
}

export function getInterval(value: DateIntervalValue): number {
  return Math.abs(value.value);
}

export function setInterval(
  value: DateIntervalValue,
  interval: number,
): DateIntervalValue {
  const sign = Math.sign(value.value);

  return {
    ...value,
    value: Math.max(Math.abs(Math.floor(interval)), 1) * sign,
  };
}

export function getUnitOptions(value: DateIntervalValue) {
  const interval = getInterval(value);

  return DATE_PICKER_TRUNCATION_UNITS.map(unit => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit, interval).toLowerCase(),
  }));
}

export function formatDateRange({
  value,
  unit,
  offsetValue,
  offsetUnit,
  options,
}: RelativeDatePickerValue): string {
  return Lib.formatRelativeDateRange({
    value,
    unit,
    offsetValue,
    offsetUnit,
    includeCurrent: options?.["include-current"],
  });
}
