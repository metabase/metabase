import type { PickerOperatorOption } from "../types";

type TimePickerOperator = ">" | "<" | "between" | "is-null" | "not-null";

export interface OperatorOption
  extends PickerOperatorOption<TimePickerOperator> {
  valueCount: number;
}
