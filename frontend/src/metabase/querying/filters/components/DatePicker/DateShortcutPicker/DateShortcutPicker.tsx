import { Fragment, useMemo } from "react";

import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValueType,
  RelativeDatePickerValue,
} from "metabase/querying/filters/types";
import { Box, Button, Divider, PopoverBackButton } from "metabase/ui";

import { MIN_WIDTH } from "../constants";

import { getShortcutOptionGroups, getTypeOptions } from "./utils";

interface DateShortcutPickerProps {
  availableOperators: DatePickerOperator[];
  availableShortcuts: DatePickerShortcut[];
  backButtonLabel?: string;
  onChange: (value: RelativeDatePickerValue) => void;
  onSelectType: (type: DatePickerValueType) => void;
  onBack?: () => void;
}

export function DateShortcutPicker({
  availableOperators,
  availableShortcuts,
  backButtonLabel,
  onChange,
  onSelectType,
  onBack,
}: DateShortcutPickerProps) {
  const shortcutGroups = useMemo(() => {
    return getShortcutOptionGroups(availableShortcuts);
  }, [availableShortcuts]);

  const typeOptions = useMemo(() => {
    return getTypeOptions(availableOperators);
  }, [availableOperators]);

  return (
    <Box p="sm" miw={MIN_WIDTH}>
      {onBack && (
        <PopoverBackButton p="sm" onClick={onBack}>
          {backButtonLabel}
        </PopoverBackButton>
      )}
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
