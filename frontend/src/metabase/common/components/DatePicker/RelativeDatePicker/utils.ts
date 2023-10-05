import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";
import { DEFAULT_VALUE } from "./constants";
import type { TabType } from "./types";

export function getTabType(
  value: RelativeDatePickerValue = DEFAULT_VALUE,
): TabType {
  if (value.value === "current") {
    return "current";
  } else {
    return value.value < 0 ? "past" : "next";
  }
}

export function getValueAfterTabChange(
  type: TabType,
  value: RelativeDatePickerValue = DEFAULT_VALUE,
): RelativeDatePickerValue | undefined {
  const valueOrDefault =
    value.value === "current"
      ? DEFAULT_VALUE
      : { ...value, value: value.value };

  switch (type) {
    case "current":
      return undefined;
    case "past":
      return { ...valueOrDefault, value: -Math.abs(valueOrDefault.value) };
    case "next":
      return { ...valueOrDefault, value: Math.abs(valueOrDefault.value) };
  }
}

export function getCurrentValue(
  unit: DatePickerTruncationUnit,
): RelativeDatePickerValue {
  return {
    type: "relative",
    value: "current",
    unit,
  };
}
