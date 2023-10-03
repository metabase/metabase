export type DatePickerOperator =
  | "="
  | "!="
  | "<"
  | ">"
  | "between"
  | "is-null"
  | "not-null";

export type DatePickerShortcut =
  | "today"
  | "yesterday"
  | "last-week"
  | "last-7-days"
  | "last-30-days"
  | "last-month"
  | "last-3-months"
  | "last-12-months";

export type DatePickerTruncationUnit =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "quarter"
  | "month"
  | "year";

export type DatePickerExtractionUnit =
  | "hour-of-day"
  | "day-of-week"
  | "month-of-year"
  | "quarter-of-year";

export interface RelativeDatePickerValue {
  type: "relative";
  unit: DatePickerTruncationUnit;
  value: number | "current";
  offsetUnit?: DatePickerTruncationUnit;
  offsetValue?: number;
  options?: RelativeDatePickerOptions;
}

export interface RelativeDatePickerOptions {
  "include-current"?: boolean;
}

export interface ExcludeDatePickerValue {
  type: "exclude";
  operator: DatePickerOperator;
  unit?: DatePickerExtractionUnit;
  values: number[];
}

export type DatePickerValue = RelativeDatePickerValue | ExcludeDatePickerValue;

export type DatePickerValueType = DatePickerValue["type"];
