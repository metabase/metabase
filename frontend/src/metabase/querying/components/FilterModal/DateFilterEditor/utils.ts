import type { DatePickerValue } from "metabase/querying/components/DatePicker";
import { getShortcutOptions } from "metabase/querying/components/DatePicker";
import * as Lib from "metabase-lib";

import { MAIN_SHORTCUTS } from "./constants";

export function getFilterName(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause | undefined,
) {
  return filter
    ? Lib.filterArgsDisplayName(query, stageIndex, filter)
    : undefined;
}

function getAvailableOptions() {
  return getShortcutOptions(MAIN_SHORTCUTS);
}

export function getSelectedOption(value: DatePickerValue | undefined) {
  return getAvailableOptions().find(
    option =>
      value?.type === "relative" &&
      option.value.value === value.value &&
      option.value.unit === value.unit,
  );
}

export function getVisibleOptions(value: DatePickerValue | undefined) {
  return value == null || getSelectedOption(value) != null
    ? getAvailableOptions()
    : [];
}
