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
  onSubmit,
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
      size={inputProps?.size}
      autoFocus={autoFocus}
      variant={inputProps?.variant}
      placeholder={inputProps?.placeholder}
      value={value}
      valueFormat={valueFormat}
      classNames={{ input: inputProps?.className }}
      // Keeps popover mounted when focused to improve time editing UX
      popoverProps={{ opened: isFocused }}
      onChange={setValue}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyUp={handleKeyUp}
    />
  );
};
