import type { RelativeIntervalDirection, DatePickerOperator } from "../types";

export type OptionType =
  | "none"
  | DatePickerOperator
  | RelativeIntervalDirection;

export interface OperatorOption {
  label: string;
  value: OptionType;
  operators: DatePickerOperator[];
}
