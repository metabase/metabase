import { DATE_PICKER_TRUNCATION_UNITS } from "metabase/querying/filters/constants";
import type {
  DatePickerTruncationUnit,
  DatePickerUnit,
  DatePickerValue,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

import { DEFAULT_VALUE } from "./constants";
import type { DateIntervalValue, DateOffsetIntervalValue } from "./types";

export function isRelativeValue(
  value: DatePickerValue | undefined,
): value is RelativeDatePickerValue {
  return value != null && value.type === "relative";
}

export function isIntervalValue(
  value: RelativeDatePickerValue | undefined,
): value is DateIntervalValue {
  return value != null && value.value !== "current";
}

export function isOffsetIntervalValue(
  value: RelativeDatePickerValue | undefined,
): value is DateOffsetIntervalValue {
  return (
    value != null &&
    isIntervalValue(value) &&
    value.offsetValue != null &&
    value.offsetUnit != null
  );
}

export function getDirection(
  value: RelativeDatePickerValue | undefined,
): RelativeIntervalDirection {
  if (value == null || value.value === "current") {
    return "current";
  } else {
    return value.value < 0 ? "last" : "next";
  }
}

export function getDirectionDefaultValue(direction: RelativeIntervalDirection) {
  return setDirectionAndCoerceUnit(DEFAULT_VALUE, direction);
}

export function setDirection(
  value: RelativeDatePickerValue = DEFAULT_VALUE,
  direction: RelativeIntervalDirection,
  fallbackUnit?: DatePickerTruncationUnit,
): RelativeDatePickerValue | undefined {
  if (direction === "current") {
    return fallbackUnit
      ? { type: "relative", value: "current", unit: fallbackUnit }
      : undefined;
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

export function getAvailableTruncationUnits(availableUnits: DatePickerUnit[]) {
  return DATE_PICKER_TRUNCATION_UNITS.filter(unit =>
    availableUnits.includes(unit),
  );
}

export function getUnitOptions(
  value: DateIntervalValue,
  availableUnits: DatePickerUnit[],
) {
  const truncationUnits = getAvailableTruncationUnits(availableUnits);
  const interval = getInterval(value);

  return truncationUnits.map(unit => ({
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
    includeCurrent: options?.includeCurrent,
  });
}
