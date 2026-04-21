import type {
  DatePickerExtractionUnit,
  ExcludeDatePickerOperator,
} from "metabase/querying/common/types";

export interface ExcludeUnitOption {
  unit: DatePickerExtractionUnit;
  label: string;
}

export interface ExcludeOperatorOption {
  operator: ExcludeDatePickerOperator;
  label: string;
}

export interface ExcludeValueOption {
  value: number;
  label: string;
}
