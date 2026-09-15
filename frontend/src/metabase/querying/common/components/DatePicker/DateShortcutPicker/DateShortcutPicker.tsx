import { Fragment, type ReactNode, useMemo } from "react";

import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValueType,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";
import { Button, Divider, Stack } from "metabase/ui";

import { ITEM_BUTTON_VARS, MIN_WIDTH } from "../constants";

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
    <Stack p="lg" gap="lg" miw={MIN_WIDTH}>
      {renderBackButton?.()}
      {shortcutGroups.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 && <Divider />}
          {group.map((option, optionIndex) => (
            <Button
              key={optionIndex}
              variant="transparent"
              size="compact-md"
              color="neutral"
              justify="flex-start"
              vars={() => ({ root: ITEM_BUTTON_VARS })}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </Fragment>
      ))}
      {shortcutGroups.length > 0 && typeOptions.length > 0 && <Divider />}
      {typeOptions.map((option, optionIndex) => (
        <Button
          key={optionIndex}
          variant="transparent"
          size="compact-md"
          color="neutral"
          justify="flex-start"
          vars={() => ({ root: ITEM_BUTTON_VARS })}
          onClick={() => onSelectType(option.type)}
          data-testid={`date-picker-type-${option.type}`}
        >
          {option.label}
        </Button>
      ))}
    </Stack>
  );
}
