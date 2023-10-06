import type { RelativeDatePickerValue } from "../types";

export type IntervalDirection = "past" | "current" | "next";

export interface Tab {
  label: string;
  direction: IntervalDirection;
}

export interface RelativeDateIntervalValue extends RelativeDatePickerValue {
  value: number;
}
