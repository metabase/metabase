import type {
  DatePickerOperator,
  DatePickerValueType,
} from "metabase/querying/common/types";

export interface TypeOption {
  label: string;
  type: DatePickerValueType;
  operators: DatePickerOperator[];
}
