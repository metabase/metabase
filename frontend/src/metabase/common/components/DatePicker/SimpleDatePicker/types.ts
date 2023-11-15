import type { DatePickerOperator } from "metabase/common/components/DatePicker";

export type OptionType =
  | "none"
  | "last"
  | "next"
  | "current"
  | "<"
  | ">"
  | "="
  | "between"
  | "is-null"
  | "not-null";

export interface Option {
  label: string;
  value: OptionType;
  operators: DatePickerOperator[];
}
