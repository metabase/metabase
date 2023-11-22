import type { OperatorOption } from "../types";

export type StringPickerOperator =
  | "="
  | "!="
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with"
  | "is-empty"
  | "not-empty";

export interface StringOperatorOption
  extends OperatorOption<StringPickerOperator> {
  valueCount: number;
  hasMultipleValues?: boolean;
  hasCaseSensitiveOption?: boolean;
}
