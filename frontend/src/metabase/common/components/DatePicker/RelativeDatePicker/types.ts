import type {
  DatePickerIntervalDirection,
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";

export interface Tab {
  label: string;
  direction: DatePickerIntervalDirection;
}

export interface DateIntervalValue extends RelativeDatePickerValue {
  value: number;
}

export interface DateOffsetIntervalValue extends DateIntervalValue {
  offsetValue: number;
  offsetUnit: DatePickerTruncationUnit;
}
