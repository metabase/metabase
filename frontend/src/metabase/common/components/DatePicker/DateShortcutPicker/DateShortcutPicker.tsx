import { Fragment, useMemo } from "react";
import { Divider } from "metabase/ui";
import { OptionButton } from "../OptionButton";
import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValueType,
  RelativeDatePickerValue,
} from "../types";
import { getShortcutOptionGroups, getTypeOptions } from "./utils";

interface DateShortcutPickerProps {
  availableOperators: DatePickerOperator[];
  availableShortcuts: DatePickerShortcut[];
  onChange: (value: RelativeDatePickerValue) => void;
  onNavigate: (type: DatePickerValueType) => void;
}

export function DateShortcutPicker({
  availableOperators,
  availableShortcuts,
  onChange,
  onNavigate,
}: DateShortcutPickerProps) {
  const shortcutGroups = useMemo(() => {
    return getShortcutOptionGroups(availableShortcuts);
  }, [availableShortcuts]);

  const typeOptions = useMemo(() => {
    return getTypeOptions(availableOperators);
  }, [availableOperators]);

  return (
    <div>
      {shortcutGroups.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 && <Divider mx="md" />}
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
        <Divider mx="md" />
      )}
      {typeOptions.map((option, optionIndex) => (
        <OptionButton key={optionIndex} onClick={() => onNavigate(option.type)}>
          {option.label}
        </OptionButton>
      ))}
    </div>
  );
}
