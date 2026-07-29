import { type KeyboardEvent, useCallback, useState } from "react";

import { DateInput } from "metabase/ui";
import { DEFAULT_DATE_STYLE } from "metabase/utils/formatting/datetime-utils";

import type { TableActionInputSharedProps } from "./types";
import {
  DateValueTimezoneFormat,
  useDateValueWithoutTimezone,
} from "./use-date-value-without-timezone";

export type TableActionInputDateProps = TableActionInputSharedProps & {
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
  onChange,
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
      setFocused(false);
      const restored = restoreTimezone(value);
      onChange?.(restored);
      onBlur?.(restored);
    },
    [restoreTimezone, onChange, onBlur],
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
      popoverProps={{ opened: isFocused }}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onClick={handleFocus}
      onKeyUp={handleKeyUp}
      {...inputProps}
    />
  );
};
