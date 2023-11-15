import type { RelativeIntervalDirection, DatePickerOperator } from "../types";

export type OperatorType =
  | "none"
  | DatePickerOperator
  | RelativeIntervalDirection;

export interface OperatorOption {
  label: string;
  value: OperatorType;
  operators: DatePickerOperator[];
}
