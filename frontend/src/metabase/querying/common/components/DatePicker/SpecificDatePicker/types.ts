import type { SpecificDatePickerOperator } from "metabase/querying/common/types";

export interface Tab {
  label: string;
  operator: SpecificDatePickerOperator;
}
