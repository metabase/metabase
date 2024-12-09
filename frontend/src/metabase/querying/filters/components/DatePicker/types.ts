import type {
  DATE_PICKER_EXTRACTION_UNITS,
  DATE_PICKER_SHORTCUTS,
  DATE_PICKER_TRUNCATION_UNITS,
  EXCLUDE_DATE_PICKER_OPERATORS,
  SPECIFIC_DATE_PICKER_OPERATORS,
} from "./constants";

export type DatePickerOperator =
  | SpecificDatePickerOperator
  | ExcludeDatePickerOperator;

export type SpecificDatePickerOperator =
  (typeof SPECIFIC_DATE_PICKER_OPERATORS)[number];

export type ExcludeDatePickerOperator =
  (typeof EXCLUDE_DATE_PICKER_OPERATORS)[number];

export type DatePickerShortcut = (typeof DATE_PICKER_SHORTCUTS)[number];

export type DatePickerUnit =
  | DatePickerExtractionUnit
  | DatePickerTruncationUnit;

export type DatePickerExtractionUnit =
  (typeof DATE_PICKER_EXTRACTION_UNITS)[number];

export type DatePickerTruncationUnit =
  (typeof DATE_PICKER_TRUNCATION_UNITS)[number];

export interface SpecificDatePickerValue {
  type: "specific";
  operator: SpecificDatePickerOperator;
  values: Date[];
  hasTime: boolean;
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
  includeCurrent?: boolean;
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

export interface ShortcutOption {
  label: string;
  shortcut: DatePickerShortcut;
  value: RelativeDatePickerValue;
}
