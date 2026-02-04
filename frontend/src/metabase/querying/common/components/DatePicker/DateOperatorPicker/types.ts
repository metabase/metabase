import type {
  DatePickerOperator,
  RelativeIntervalDirection,
} from "metabase/querying/filters/types";

export type OptionType =
  | "none"
  | DatePickerOperator
  | RelativeIntervalDirection;

export interface OperatorOption {
  label: string;
  value: OptionType;
  operators: DatePickerOperator[];
}
