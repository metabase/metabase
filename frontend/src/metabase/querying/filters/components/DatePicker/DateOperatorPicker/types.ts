import type {
  DatePickerOperator,
  DatePickerRelativeDirection,
} from "metabase/querying/filters/types";

export type OptionType =
  | "none"
  | DatePickerOperator
  | DatePickerRelativeDirection;

export interface OperatorOption {
  label: string;
  value: OptionType;
  operators: DatePickerOperator[];
}
