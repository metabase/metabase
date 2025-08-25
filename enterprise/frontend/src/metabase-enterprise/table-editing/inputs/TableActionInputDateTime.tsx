import { useDisclosure } from "@mantine/hooks";
import { type KeyboardEvent, useCallback, useState } from "react";

import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/datetime-utils";
import { DateTimePicker } from "metabase/ui";

import type { TableActionInputSharedProps } from "./types";
import { useDateValueWithoutTimezone } from "./use-date-value-without-timezone";

export type TableActionInputDateTimeProps = TableActionInputSharedProps & {
  dateTimeStyle?: string;
  classNames?: {
    wrapper?: string;
    dateTextInputElement?: string;
  };
};

const DEFAULT_DATETIME_STYLE = `${DEFAULT_DATE_STYLE}, ${DEFAULT_TIME_STYLE}`;

export const TableActionInputDateTime = ({
  dateTimeStyle = DEFAULT_DATETIME_STYLE,
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  onChange,
  onEscape,
  onEnter,
  onBlur,
}: TableActionInputDateTimeProps) => {
  const { localDate: initialValueWithoutTimezone, restoreTimezone } =
    useDateValueWithoutTimezone(initialValue ?? null);

  const [value, setValue] = useState(initialValueWithoutTimezone ?? null);
  const [dropdownOpened, dropdownHandlers] = useDisclosure(autoFocus);

  const handleChange = useCallback(
    (value: string | null) => {
      setValue(value);
      onChange?.(restoreTimezone(value));
    },
    [onChange, restoreTimezone],
  );

  const handleSubmit = useCallback(() => {
    onBlur?.(restoreTimezone(value));
    dropdownHandlers.close();
  }, [value, onBlur, dropdownHandlers, restoreTimezone]);

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        onEnter?.(restoreTimezone(value));
        dropdownHandlers.close();
      }
    },
    [value, onEnter, dropdownHandlers, restoreTimezone],
  );

  const handleDismiss = useCallback(() => {
    onEscape?.(restoreTimezone(value));
    dropdownHandlers.close();
  }, [value, onEscape, dropdownHandlers, restoreTimezone]);

  return (
    <DateTimePicker
      value={value}
      valueFormat={dateTimeStyle}
      classNames={{
        wrapper: classNames?.wrapper,
        input: classNames?.dateTextInputElement,
      }}
      onClick={dropdownHandlers.open}
      submitButtonProps={{
        variant: "light",
        onClick: handleSubmit,
      }}
      popoverProps={{
        opened: dropdownOpened,
        onDismiss: handleDismiss,
        styles: {
          dropdown: {
            "--popover-padding": "var(--mantine-spacing-md)",
          },
        },
      }}
      timePickerProps={{ format: "12h", onKeyUp: handleKeyUp }}
      onChange={handleChange}
      {...inputProps}
    />
  );
};
