import type { RelativeDatePickerValue } from "../types";
import { DEFAULT_VALUE } from "./constants";
import type { TabType } from "./types";

export function getTabType(value: RelativeDatePickerValue): TabType {
  if (value.value === "current") {
    return "current";
  } else {
    return value.value < 0 ? "past" : "next";
  }
}

export function getValueAfterTabChange(
  type: TabType,
  value: RelativeDatePickerValue = DEFAULT_VALUE,
): RelativeDatePickerValue {
  switch (type) {
    case "current":
      return { ...DEFAULT_VALUE, value: "current" };
    case "past":
      return value.value === "current"
        ? { ...DEFAULT_VALUE, value: -Math.abs(DEFAULT_VALUE.value) }
        : { ...value, value: -Math.abs(value.value) };
    case "next":
      return value.value === "current"
        ? { ...DEFAULT_VALUE, value: Math.abs(DEFAULT_VALUE.value) }
        : { ...value, value: Math.abs(value.value) };
  }
}
