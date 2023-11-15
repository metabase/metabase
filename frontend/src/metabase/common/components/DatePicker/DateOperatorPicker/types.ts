import type { DatePickerOperator } from "../types";

export type OperatorType =
  | DatePickerOperator
  | "none"
  | "last"
  | "next"
  | "current";

export interface OperatorOption {
  label: string;
  value: OperatorType;
  operators: DatePickerOperator[];
}
