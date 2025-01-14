import type {
  DatePickerOperator,
  DatePickerValueType,
} from "metabase/querying/filters/types";

export interface TypeOption {
  label: string;
  type: DatePickerValueType;
  operators: DatePickerOperator[];
}
