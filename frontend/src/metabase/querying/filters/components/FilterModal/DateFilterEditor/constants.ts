import type { DatePickerShortcut } from "metabase/querying/filters/types";

export const MAIN_SHORTCUTS: DatePickerShortcut[] = [
  "today",
  "yesterday",
  "previous-week",
  "previous-month",
];

export const SECONDARY_SHORTCUTS: DatePickerShortcut[] = [
  "previous-7-days",
  "previous-30-days",
  "previous-3-months",
  "previous-12-months",
];
