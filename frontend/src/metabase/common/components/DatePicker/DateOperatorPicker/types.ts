import type { DatePickerIntervalDirection, DatePickerOperator } from "../types";

export type OperatorType =
  | "none"
  | DatePickerOperator
  | DatePickerIntervalDirection;

export interface OperatorOption {
  label: string;
  value: OperatorType;
  operators: DatePickerOperator[];
}
