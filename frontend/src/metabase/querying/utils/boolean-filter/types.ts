import type { OperatorOption } from "../filter-operator";

type BooleanPickerOperator = "=" | "is-null" | "not-null";

export type OptionType = "true" | "false" | "is-null" | "not-null";

export interface Option extends OperatorOption<BooleanPickerOperator> {
  type: OptionType;
  isAdvanced?: boolean;
}
