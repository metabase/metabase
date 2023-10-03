import type { DatePickerExtractionUnit, DatePickerOperator } from "../types";

export interface ExcludeUnitOption {
  unit: DatePickerExtractionUnit;
  label: string;
}

export interface ExcludeOperatorOption {
  operator: DatePickerOperator;
  label: string;
}

export interface ExcludeValueOption {
  value: number;
  label: string;
}
