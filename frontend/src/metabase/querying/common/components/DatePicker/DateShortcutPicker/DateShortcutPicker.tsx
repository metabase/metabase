import { Fragment, type ReactNode, useMemo } from "react";

import { Box, Button, Divider } from "metabase/ui";

import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValueType,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "../../../types";
import { MIN_WIDTH } from "../constants";

import Styles from "./DateShortcutPicker.module.css";
import { getShortcutOptionGroups, getTypeOptions } from "./utils";

interface DateShortcutPickerProps {
  availableOperators: DatePickerOperator[];
  availableShortcuts: DatePickerShortcut[];
  availableDirections: RelativeIntervalDirection[];
  renderBackButton?: () => ReactNode;
  onChange: (value: RelativeDatePickerValue) => void;
  onSelectType: (type: DatePickerValueType) => void;
}

export function DateShortcutPicker({
  availableOperators,
  availableShortcuts,
  availableDirections,
  renderBackButton,
  onChange,
  onSelectType,
}: DateShortcutPickerProps) {
  const shortcutGroups = useMemo(() => {
    return getShortcutOptionGroups(availableShortcuts, availableDirections);
  }, [availableShortcuts, availableDirections]);

  const typeOptions = useMemo(() => {
    return getTypeOptions(availableOperators);
  }, [availableOperators]);

  return (
    <Box p="sm" miw={MIN_WIDTH}>
      {renderBackButton?.()}
      {shortcutGroups.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 && <Divider mx="md" my="sm" />}
          {group.map((option, optionIndex) => (
            <Button
              key={optionIndex}
              classNames={{
                root: Styles.Button,
              }}
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
          classNames={{
            root: Styles.Button,
          }}
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
