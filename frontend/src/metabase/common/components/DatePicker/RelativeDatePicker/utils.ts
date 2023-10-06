import * as Lib from "metabase-lib";
import { DATE_PICKER_TRUNCATION_UNITS } from "../constants";
import type { RelativeDatePickerValue } from "../types";
import { DEFAULT_VALUE } from "./constants";
import type {
  IntervalDirection,
  DateIntervalValue,
  DateOffsetIntervalValue,
} from "./types";

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

export function getDirection(
  value: RelativeDatePickerValue,
): IntervalDirection {
  if (value.value === "current") {
    return "current";
  } else {
    return value.value < 0 ? "past" : "next";
  }
}

export function setDirection(
  value: RelativeDatePickerValue,
  direction: IntervalDirection,
): RelativeDatePickerValue {
  const valueOrDefault = isIntervalValue(value) ? value : DEFAULT_VALUE;

  switch (direction) {
    case "current":
      return { type: "relative", value: "current", unit: "hour" };
    case "past":
      return { ...valueOrDefault, value: -Math.abs(valueOrDefault.value) };
    case "next":
      return { ...valueOrDefault, value: Math.abs(valueOrDefault.value) };
  }
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

export function getUnitOptions(interval: number) {
  return DATE_PICKER_TRUNCATION_UNITS.map(unit => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit, interval).toLowerCase(),
  }));
}
