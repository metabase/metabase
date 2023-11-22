import type { MouseEvent } from "react";
import { useCallback } from "react";
import { t } from "ttag";
import { Button, Popover } from "metabase/ui";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import type {
  DatePickerValue,
  DatePickerProps,
} from "metabase/common/components/DatePicker";
import { DatePicker } from "metabase/common/components/DatePicker";
import { useToggle } from "metabase/hooks/use-toggle";
import type * as Lib from "metabase-lib";
import { ClearIcon } from "./DateFilterEditor.styled";

// https://v6.mantine.dev/core/modal/?t=props
const MODAL_Z_INDEX = 200;

interface CustomFilterPopoverProps extends DatePickerProps {
  filterInfo: Lib.ClauseDisplayInfo;
  onClear: () => void;
}

export function CustomFilterPopover({
  filterInfo,
  onChange,
  onClear,
  ...props
}: CustomFilterPopoverProps) {
  const [isOpen, { turnOn: handleOpen, turnOff: handleClose }] =
    useToggle(false);

  const handleChange = useCallback(
    (value: DatePickerValue) => {
      onChange(value);
      handleClose();
    },
    [onChange, handleClose],
  );

  const handleClear = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onClear();
    },
    [onClear],
  );

  return (
    <Popover opened={isOpen} zIndex={MODAL_Z_INDEX + 1} onClose={handleClose}>
      <Popover.Target>
        <Button
          variant="outline"
          rightIcon={
            <IconButtonWrapper aria-label={t`Clear`} onClick={handleClear}>
              <ClearIcon name="close" size={12} />
            </IconButtonWrapper>
          }
          onClick={handleOpen}
        >
          {filterInfo.displayName}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <DatePicker {...props} canUseRelativeOffsets onChange={handleChange} />
      </Popover.Dropdown>
    </Popover>
  );
}
