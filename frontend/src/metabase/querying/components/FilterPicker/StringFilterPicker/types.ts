import type { PickerOperatorOption } from "../types";

type StringPickerOperator =
  | "="
  | "!="
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with"
  | "is-empty"
  | "not-empty";

export interface OperatorOption
  extends PickerOperatorOption<StringPickerOperator> {
  valueCount: number;
  hasMultipleValues?: boolean;
  hasCaseSensitiveOption?: boolean;
}
