import type { OperatorOption } from "../types";

type BooleanPickerOperator = "=" | "is-null" | "not-null";

export type OptionType = "true" | "false" | "is-null" | "not-null";

export interface BooleanOperatorOption
  extends OperatorOption<BooleanPickerOperator> {
  name: string;
  type: OptionType;
}
