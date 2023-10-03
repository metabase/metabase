import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  ExcludeDatePickerValue,
} from "../types";

export interface ExcludeUnitOption {
  unit: DatePickerExtractionUnit;
  label: string;
}

export interface ExcludeOperatorOption {
  operator: DatePickerOperator;
  label: string;
  value: ExcludeDatePickerValue;
}

export interface ExcludeValueOption {
  value: number;
  label: string;
}
