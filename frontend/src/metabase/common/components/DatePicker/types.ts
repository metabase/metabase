export type DatePickerOperator =
  | "="
  | "!="
  | "<"
  | ">"
  | "between"
  | "is-null"
  | "not-null";

export type DatePickerExtractionUnit =
  | "hour-of-day"
  | "day-of-week"
  | "month-of-year"
  | "quarter-of-year";

export interface ExcludeDatePickerValue {
  type: "exclude";
  operator: DatePickerOperator;
  unit?: DatePickerExtractionUnit;
  values: number[];
}

export type DatePickerValue = ExcludeDatePickerValue;
