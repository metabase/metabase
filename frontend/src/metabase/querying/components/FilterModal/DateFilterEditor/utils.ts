import { getShortcutOptions } from "metabase/querying/components/DatePicker";
import type {
  DatePickerValue,
  ShortcutOption,
} from "metabase/querying/components/DatePicker";
import { MAIN_SHORTCUTS } from "./constants";

export function getSelectedOption(
  options: ShortcutOption[],
  value: DatePickerValue | undefined,
) {
  return options.find(
    option =>
      value?.type === "relative" &&
      option.value.value === value.value &&
      option.value.unit === value.unit,
  );
}

export function getOptionsInfo(value: DatePickerValue | undefined) {
  const availableOptions = getShortcutOptions(MAIN_SHORTCUTS);
  const selectedOption = getSelectedOption(availableOptions, value);
  const visibleOptions =
    value == null || selectedOption != null ? availableOptions : [];
  return { visibleOptions, selectedOption };
}
