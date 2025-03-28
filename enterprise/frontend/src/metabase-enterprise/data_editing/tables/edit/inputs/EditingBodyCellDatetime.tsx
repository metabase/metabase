import { type KeyboardEvent, useCallback, useState } from "react";

import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/datetime-utils";
import { DateInput } from "metabase/ui";

import type { EditingBodyPrimitiveProps } from "./types";

const DEFAULT_DATETIME_STYLE = `${DEFAULT_DATE_STYLE}, ${DEFAULT_TIME_STYLE}`;

export const EditingBodyCellDatetime = ({
  autoFocus,
  inputProps,
  initialValue,
  datasetColumn,
  classNames,
  onSubmit,
  onChangeValue,
  onCancel,
}: EditingBodyPrimitiveProps) => {
  const isDateTime =
    datasetColumn.effective_type === "type/DateTime" ||
    datasetColumn.effective_type === "type/DateTimeWithLocalTZ";

  const initialDateValue = initialValue
    ? new Date(initialValue?.toString())
    : null;

  const valueFormat = isDateTime ? DEFAULT_DATETIME_STYLE : DEFAULT_DATE_STYLE;

  const [value, setValue] = useState<Date | null>(initialDateValue);
  const [isFocused, setFocused] = useState(false);

  const handleChange = useCallback(
    (value: Date | null) => {
      setValue(value);
      onChangeValue?.(value ? value.toISOString() : null);
    },
    [onChangeValue],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, [setFocused]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onSubmit(value ? value.toISOString() : null);
  }, [value, onSubmit]);

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      } else if (event.key === "Enter") {
        onSubmit(value ? value.toISOString() : null);
      }
    },
    [value, onCancel, onSubmit],
  );

  return (
    <DateInput
      autoFocus={autoFocus}
      value={value}
      valueFormat={valueFormat}
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
