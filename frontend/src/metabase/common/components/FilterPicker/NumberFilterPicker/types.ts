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

export interface Option extends PickerOperatorOption<NumberPickerOperator> {
  valueCount: number;
}
