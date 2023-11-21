import type { OperatorOption } from "../types";

export type TimePickerOperator = ">" | "<" | "between" | "is-null" | "not-null";

export interface TimeOperatorOption extends OperatorOption<TimePickerOperator> {
  valueCount: number;
}
