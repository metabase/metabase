import type { RelativeDatePickerValue } from "../types";
import { DEFAULT_VALUE } from "./constants";
import type { IntervalDirection, RelativeDateIntervalValue } from "./types";

export function isIntervalValue(
  value: RelativeDatePickerValue,
): value is RelativeDateIntervalValue {
  return value.value !== "current";
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
