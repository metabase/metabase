import type { OperatorOption } from "../types";

type BooleanPickerOperator = "=" | "is-null" | "not-null";

export type OptionType = "true" | "false" | "is-null" | "not-null";

export interface Option extends OperatorOption<BooleanPickerOperator> {
  operator: BooleanPickerOperator;
  type: OptionType;
  isAdvanced?: boolean;
}
