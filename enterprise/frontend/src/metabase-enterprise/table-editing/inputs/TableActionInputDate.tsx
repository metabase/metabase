import { type KeyboardEvent, useCallback, useState } from "react";

import { DEFAULT_DATE_STYLE } from "metabase/lib/formatting/datetime-utils";
import { DateInput } from "metabase/ui";

import type { TableActionInputSharedProps } from "./types";
import {
  DateValueTimezoneFormat,
  useDateValueWithoutTimezone,
} from "./use-date-value-without-timezone";

export type TableActionInputDateProps = Omit<
  TableActionInputSharedProps,
  "onChange"
> & {
  dateStyle?: string;
  classNames?: {
    wrapper?: string;
    dateTextInputElement?: string;
  };
};

export const TableActionInputDate = ({
  dateStyle = DEFAULT_DATE_STYLE,
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  onBlur,
  onEscape,
  onEnter,
}: TableActionInputDateProps) => {
  const { localDate: initialValueWithoutTimezone, restoreTimezone } =
    useDateValueWithoutTimezone(initialValue ?? null, {
      valueFormat: "YYYY-MM-DD",
      timezoneFormat: DateValueTimezoneFormat.Never,
    });

  const [value, setValue] = useState(initialValueWithoutTimezone);
  const [isFocused, setFocused] = useState(false);

  const handleChange = useCallback(
    (value: string | null) => {
      setValue(value);
      onEnter?.(restoreTimezone(value));
    },
    [restoreTimezone, onEnter],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, [setFocused]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onBlur?.(restoreTimezone(value));
  }, [value, onBlur, restoreTimezone]);

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape?.(restoreTimezone(value));
      } else if (event.key === "Enter") {
        onEnter?.(restoreTimezone(value));
      }
    },
    [value, onEscape, onEnter, restoreTimezone],
  );

  return (
    <DateInput
      autoFocus={autoFocus}
      value={value}
      valueFormat={dateStyle}
      classNames={{
        wrapper: classNames?.wrapper,
        input: classNames?.dateTextInputElement,
      }}
      // Keeps popover mounted when focused to improve time editing UX
      popoverProps={{ opened: isFocused }}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyUp={handleKeyUp}
      {...inputProps}
    />
  );
};
