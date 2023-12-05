import { useCallback, useState } from "react";
import { Button, Popover } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { DatePicker } from "metabase/querying/components/DatePicker";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValue,
} from "metabase/querying/components/DatePicker";

const SHORTCUTS: DatePickerShortcut[] = [
  "last-7-days",
  "last-30-days",
  "last-3-months",
  "last-12-months",
];

interface DateFilterPopoverProps {
  value?: DatePickerValue;
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  availableUnits?: ReadonlyArray<DatePickerExtractionUnit>;
  onChange: (value: DatePickerValue) => void;
}

export function DateFilterPopover({
  onChange,
  ...props
}: DateFilterPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const handleChange = useCallback(
    (value: DatePickerValue) => {
      onChange(value);
      setIsOpened(false);
    },
    [onChange],
  );

  return (
    <Popover opened={isOpened} onClose={() => setIsOpened(false)}>
      <Popover.Target>
        <Button
          leftIcon={<Icon name="ellipsis" />}
          onClick={() => setIsOpened(true)}
        />
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
