import dayjs from "dayjs";
import { type KeyboardEvent, useCallback, useMemo, useState } from "react";

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

  const { restoreTimezone, initialDateWithOffset } = useMemo(() => {
    // Used for rendering the date input with the correct offset
    // For new rows, the date offset is 0
    let dateOffset = 0;
    let dateUtcOffset = 0;
    let initialDateWithOffset = null;

    if (initialValue) {
      const browserUtcOffset = dayjs(initialValue.toString()).utcOffset();
      dateUtcOffset = dayjs.parseZone(initialValue.toString()).utcOffset();
      dateOffset = dateUtcOffset - browserUtcOffset;

      const initialDate = new Date(initialValue.toString());
      initialDateWithOffset = new Date(
        initialDate.getTime() + dateOffset * 60 * 1000,
      );
    }

    return {
      dateOffset,
      initialDateWithOffset,
      restoreTimezone: (date: Date | null) => {
        if (!date) {
          return null;
        }

        // Keep browser timezone for new rows
        if (!initialValue) {
          return date.toISOString();
        }

        // Restore the date to the original timezone
        const restoredDate = new Date(date.getTime() - dateOffset * 60 * 1000);
        return dayjs(restoredDate)
          .utcOffset(dateUtcOffset)
          .format("YYYY-MM-DDTHH:mm:ss.SSSZ");
      },
    };
  }, [initialValue]);

  const valueFormat = isDateTime ? DEFAULT_DATETIME_STYLE : DEFAULT_DATE_STYLE;

  const [value, setValue] = useState<Date | null>(initialDateWithOffset);
  const [isFocused, setFocused] = useState(false);

  const handleChange = useCallback(
    (value: Date | null) => {
      setValue(value);
      onChangeValue?.(restoreTimezone(value));
    },
    [onChangeValue, restoreTimezone],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, [setFocused]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onSubmit(restoreTimezone(value));
  }, [value, onSubmit, restoreTimezone]);

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      } else if (event.key === "Enter") {
        onSubmit(restoreTimezone(value));
      }
    },
    [value, onCancel, onSubmit, restoreTimezone],
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
