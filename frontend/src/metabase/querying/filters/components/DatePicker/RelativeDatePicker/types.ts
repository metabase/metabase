import type { DatePickerRelativeDirection } from "metabase/querying/filters/types";

export interface Tab {
  label: string;
  direction: DatePickerRelativeDirection;
}
