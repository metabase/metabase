import * as Lib from "metabase-lib";
import { DATE_PICKER_TRUNCATION_UNITS } from "../constants";
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
  value: RelativeDatePickerValue,
): RelativeDatePickerValue {
  const valueOrDefault =
    value.value === "current"
      ? DEFAULT_VALUE
      : { ...value, value: value.value };

  switch (type) {
    case "current":
      return { type: "relative", value: "current", unit: "hour" };
    case "past":
      return { ...valueOrDefault, value: -Math.abs(valueOrDefault.value) };
    case "next":
      return { ...valueOrDefault, value: Math.abs(valueOrDefault.value) };
  }
}

export function getUnitOptions(interval: number) {
  return DATE_PICKER_TRUNCATION_UNITS.map(unit => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit, interval),
  }));
}
