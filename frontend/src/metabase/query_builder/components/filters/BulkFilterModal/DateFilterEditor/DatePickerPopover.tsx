import { useCallback } from "react";
import { Button, Popover } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type {
  DatePickerValue,
  DatePickerShortcut,
  DatePickerProps,
} from "metabase/common/components/DatePicker";
import { DatePicker } from "metabase/common/components/DatePicker";
import { useToggle } from "metabase/hooks/use-toggle";

// https://v6.mantine.dev/core/modal/?t=props
const MODAL_Z_INDEX = 200;

const SHORTCUTS: DatePickerShortcut[] = [
  "last-7-days",
  "last-30-days",
  "last-3-months",
  "last-12-months",
];

export function DatePickerPopover({ onChange, ...props }: DatePickerProps) {
  const [isOpen, { turnOn: handleOpen, turnOff: handleClose }] =
    useToggle(false);

  const handleChange = useCallback(
    (value: DatePickerValue) => {
      onChange(value);
      handleClose();
    },
    [onChange, handleClose],
  );

  return (
    <Popover opened={isOpen} zIndex={MODAL_Z_INDEX + 1} onClose={handleClose}>
      <Popover.Target>
        <Button leftIcon={<Icon name="ellipsis" />} onClick={handleOpen} />
      </Popover.Target>
      <Popover.Dropdown>
        <DatePicker
          {...props}
          availableShortcuts={SHORTCUTS}
          canUseRelativeOffsets
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
