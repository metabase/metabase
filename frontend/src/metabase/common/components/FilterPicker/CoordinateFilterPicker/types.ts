import type { PickerOperatorOption } from "../types";

type CoordinatePickerOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | "inside"
  | ">="
  | "<=";

export interface Option extends PickerOperatorOption<CoordinatePickerOperator> {
  valueCount: number;
}
