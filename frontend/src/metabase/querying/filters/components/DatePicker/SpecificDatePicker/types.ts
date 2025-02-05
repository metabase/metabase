import type { SpecificDatePickerOperator } from "metabase/querying/filters/types";

export interface Tab {
  label: string;
  operator: SpecificDatePickerOperator;
}
