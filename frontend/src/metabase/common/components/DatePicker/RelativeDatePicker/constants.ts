import type { RelativeDatePickerValue } from "../types";

export const DEFAULT_VALUE: RelativeDatePickerValue = {
  type: "relative",
  unit: "day",
  value: -30,
  offsetUnit: null,
  offsetValue: null,
};

export const UNIT_GROUPS = [
  ["day", "week", "month"],
  ["quarter", "year"],
] as const;
