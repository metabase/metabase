import type { ReactNode } from "react";
import { Fragment, useMemo } from "react";

import { Box, Button, Divider } from "metabase/ui";

import { MIN_WIDTH } from "../constants";
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
  backButton?: ReactNode;
  onChange: (value: RelativeDatePickerValue) => void;
  onSelectType: (type: DatePickerValueType) => void;
}

export function DateShortcutPicker({
  availableOperators,
  availableShortcuts,
  backButton,
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
    <Box p="sm" miw={MIN_WIDTH}>
      {backButton}
      {shortcutGroups.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 && <Divider mx="md" my="sm" />}
          {group.map((option, optionIndex) => (
            <Button
              key={optionIndex}
              c="text-dark"
              display="block"
              variant="subtle"
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </Fragment>
      ))}
      {shortcutGroups.length > 0 && typeOptions.length > 0 && (
        <Divider mx="md" my="sm" />
      )}
      {typeOptions.map((option, optionIndex) => (
        <Button
          key={optionIndex}
          c="text-dark"
          display="block"
          variant="subtle"
          onClick={() => onSelectType(option.type)}
        >
          {option.label}
        </Button>
      ))}
    </Box>
  );
}
