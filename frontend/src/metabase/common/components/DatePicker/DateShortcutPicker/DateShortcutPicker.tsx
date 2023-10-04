import { Fragment, useMemo } from "react";
import { Box, Divider } from "metabase/ui";
import { OptionButton } from "../OptionButton";
import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValueType,
  RelativeDatePickerValue,
} from "../types";
import { getShortcutOptionGroups, getTypeOptions } from "./utils";

interface DateShortcutPickerProps {
  availableOperators: ReadonlyArray<DatePickerOperator>;
  availableShortcuts: ReadonlyArray<DatePickerShortcut>;
  onChange: (value: RelativeDatePickerValue) => void;
  onSelectType: (type: DatePickerValueType) => void;
}

export function DateShortcutPicker({
  availableOperators,
  availableShortcuts,
  onChange,
  onSelectType,
}: DateShortcutPickerProps) {
  const shortcutGroups = useMemo(() => {
    return getShortcutOptionGroups(availableShortcuts);
  }, [availableShortcuts]);

  const typeOptions = useMemo(() => {
    return getTypeOptions(availableOperators);
  }, [availableOperators]);

  return (
    <Box p="sm">
      {shortcutGroups.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 && <Divider mx="md" my="sm" />}
          {group.map((option, optionIndex) => (
            <OptionButton
              key={optionIndex}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </OptionButton>
          ))}
        </Fragment>
      ))}
      {shortcutGroups.length > 0 && typeOptions.length > 0 && (
        <Divider mx="md" my="sm" />
      )}
      {typeOptions.map((option, optionIndex) => (
        <OptionButton
          key={optionIndex}
          onClick={() => onSelectType(option.type)}
        >
          {option.label}
        </OptionButton>
      ))}
    </Box>
  );
}
