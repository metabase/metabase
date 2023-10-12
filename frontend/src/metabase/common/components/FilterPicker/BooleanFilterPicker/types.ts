import type { PickerOperatorOption } from "../types";

type BooleanPickerOperator = "=" | "is-null" | "not-null";

export type OptionType = "true" | "false" | "is-null" | "not-null";

export interface Option extends PickerOperatorOption<BooleanPickerOperator> {
  type: OptionType;
  isAdvanced?: boolean;
}
