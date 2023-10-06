import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";

export type IntervalDirection = "past" | "current" | "next";

export interface Tab {
  label: string;
  direction: IntervalDirection;
}

export interface DateIntervalValue extends RelativeDatePickerValue {
  value: number;
}

export interface DateOffsetIntervalValue extends DateIntervalValue {
  offsetValue: number;
  offsetUnit: DatePickerTruncationUnit;
}
