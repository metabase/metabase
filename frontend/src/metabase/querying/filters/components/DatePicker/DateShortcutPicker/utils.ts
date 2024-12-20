import type {
  DatePickerOperator,
  DatePickerShortcut,
  ShortcutOption,
} from "metabase/querying/filters/types";

import { SHORTCUT_OPTION_GROUPS, TYPE_OPTIONS } from "./constants";
import type { TypeOption } from "./types";

export function getShortcutOptions(
  availableShortcuts: DatePickerShortcut[],
): ShortcutOption[] {
  return getShortcutOptionGroups(availableShortcuts).flat();
}

export function getShortcutOptionGroups(
  availableShortcuts: DatePickerShortcut[],
): ShortcutOption[][] {
  return SHORTCUT_OPTION_GROUPS.map(options =>
    options.filter(option => availableShortcuts.includes(option.shortcut)),
  ).filter(options => options.length > 0);
}

export function getTypeOptions(
  availableOperators: DatePickerOperator[],
): TypeOption[] {
  return TYPE_OPTIONS.filter(
    option =>
      option.operators.length === 0 ||
      option.operators.some(operator => availableOperators.includes(operator)),
  );
}
