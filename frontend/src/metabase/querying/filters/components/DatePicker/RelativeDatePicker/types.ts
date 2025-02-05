import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/filters/types";

export interface Tab {
  label: string;
  direction: RelativeIntervalDirection;
}

export interface DateIntervalValue extends RelativeDatePickerValue {
  value: number;
}

export interface DateOffsetIntervalValue extends DateIntervalValue {
  offsetValue: number;
  offsetUnit: DatePickerTruncationUnit;
}
