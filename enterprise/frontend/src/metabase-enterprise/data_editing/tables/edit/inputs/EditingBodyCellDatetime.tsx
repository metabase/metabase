import { type KeyboardEvent, useCallback, useState } from "react";

import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/datetime-utils";
import { DateInput, type DateValue } from "metabase/ui";

import S from "./EditingBodyCellInput.module.css";
import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellDatetime = ({
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

  const valueFormat = isDateTime
    ? `${DEFAULT_DATE_STYLE} ${DEFAULT_TIME_STYLE}`
    : DEFAULT_DATE_STYLE;

  const [value, setValue] = useState<Date | null>(initialDateValue);

  // For date columns we want to immediately update the value when the user selects a date
  // Whereas for datetime columns the user might want to edit the time after selecting the date
  const handleChange = useCallback(
    (newValue: DateValue) => {
      if (isDateTime) {
        setValue(newValue);
      } else {
        onSubmit(newValue ? newValue.toISOString() : null);
      }
    },
    [isDateTime, setValue, onSubmit],
  );

  const handleBlur = useCallback(() => {
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
      size="sm"
      autoFocus
      variant="unstyled"
      value={value}
      valueFormat={valueFormat}
      className={S.input}
      classNames={{ input: S.noBackground }}
      popoverProps={isDateTime ? { opened: true } : {}}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyUp={handleKeyUp}
    />
  );
};
