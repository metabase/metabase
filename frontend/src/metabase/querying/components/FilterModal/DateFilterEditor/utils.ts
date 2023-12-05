import type {
  DatePickerValue,
  ShortcutOption,
} from "metabase/querying/components/DatePicker";

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
