import type {
  SPECIFIC_DATE_PICKER_OPERATORS,
  EXCLUDE_DATE_PICKER_OPERATORS,
  DATE_PICKER_SHORTCUTS,
  DATE_PICKER_TRUNCATION_UNITS,
  DATE_PICKER_EXTRACTION_UNITS,
} from "./constants";

export type DatePickerOperator =
  | SpecificDatePickerOperator
  | ExcludeDatePickerOperator;

export type SpecificDatePickerOperator =
  typeof SPECIFIC_DATE_PICKER_OPERATORS[number];

export type ExcludeDatePickerOperator =
  typeof EXCLUDE_DATE_PICKER_OPERATORS[number];

export type DatePickerShortcut = typeof DATE_PICKER_SHORTCUTS[number];

export type DatePickerExtractionUnit =
  typeof DATE_PICKER_EXTRACTION_UNITS[number];

export type DatePickerTruncationUnit =
  typeof DATE_PICKER_TRUNCATION_UNITS[number];

export interface SpecificDatePickerValue {
  type: "specific";
  operator: SpecificDatePickerOperator;
  values: Date[];
}

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
  operator: ExcludeDatePickerOperator;
  unit?: DatePickerExtractionUnit;
  values: number[];
}

export type DatePickerValue =
  | SpecificDatePickerValue
  | RelativeDatePickerValue
  | ExcludeDatePickerValue;

export type DatePickerValueType = DatePickerValue["type"];

export type RelativeIntervalDirection = "last" | "current" | "next";
