import type { DatePickerRelativeIntervalDirection } from "metabase/querying/filters/types";

export interface Tab {
  label: string;
  direction: DatePickerRelativeIntervalDirection;
}
