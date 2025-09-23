import type {
  DatePickerOperator,
  DatePickerRelativeIntervalDirection,
} from "metabase/querying/filters/types";

export type OptionType =
  | "none"
  | DatePickerOperator
  | DatePickerRelativeIntervalDirection;

export interface OperatorOption {
  label: string;
  value: OptionType;
  operators: DatePickerOperator[];
}
