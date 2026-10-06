import { Fragment, type ReactNode, useMemo } from "react";

import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValueType,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";
import { Box, Divider } from "metabase/ui";

import { DatePickerMenuItem } from "../DatePickerMenuItem";
import { MIN_WIDTH } from "../constants";

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
          {groupIndex > 0 && <Divider mx="lg" my="sm" />}
          {group.map((option, optionIndex) => (
            <DatePickerMenuItem
              key={optionIndex}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </DatePickerMenuItem>
          ))}
        </Fragment>
      ))}
      {shortcutGroups.length > 0 && typeOptions.length > 0 && (
        <Divider mx="lg" my="sm" />
      )}
      {typeOptions.map((option, optionIndex) => (
        <DatePickerMenuItem
          key={optionIndex}
          onClick={() => onSelectType(option.type)}
          data-testid={`date-picker-type-${option.type}`}
        >
          {option.label}
        </DatePickerMenuItem>
      ))}
    </Box>
  );
}
