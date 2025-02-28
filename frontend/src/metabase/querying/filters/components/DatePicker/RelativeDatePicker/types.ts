import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/filters/types";

export interface Tab {
  label: string;
  direction: RelativeIntervalDirection;
}

export interface DateOffsetIntervalValue extends RelativeDatePickerValue {
  offsetValue: number;
  offsetUnit: DatePickerTruncationUnit;
}
