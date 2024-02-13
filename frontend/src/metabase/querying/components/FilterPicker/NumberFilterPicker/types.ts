import type { PickerOperatorOption } from "../types";

type NumberPickerOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | ">="
  | "<="
  | "is-null"
  | "not-null";

export interface OperatorOption
  extends PickerOperatorOption<NumberPickerOperator> {
  valueCount: number;
  hasMultipleValues?: boolean;
}

export type NumberValue = number | "";
