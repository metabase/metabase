import type { OperatorOption } from "../types";

export type NumberPickerOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | ">="
  | "<="
  | "is-null"
  | "not-null";

export interface NumberOperatorOption
  extends OperatorOption<NumberPickerOperator> {
  operator: NumberPickerOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
}

export type NumberValue = number | "";
