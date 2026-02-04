import type { DatePickerOperator, DatePickerValueType } from "../../../types";

export interface TypeOption {
  label: string;
  type: DatePickerValueType;
  operators: DatePickerOperator[];
}
