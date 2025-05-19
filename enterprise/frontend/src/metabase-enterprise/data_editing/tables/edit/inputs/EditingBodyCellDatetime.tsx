import { DatesProvider, useDatesContext } from "@mantine/dates";
import dayjs from "dayjs";
import { type KeyboardEvent, useCallback, useMemo, useState } from "react";

import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/datetime-utils";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
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

  const { locale, firstDayOfWeek, consistentWeeks } = useDatesContext();
  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );

  const { restoreTimezone, initialDate } = useMemo(
    () => ({
      initialDate: initialValue ? new Date(initialValue.toString()) : null,
      restoreTimezone: (date: Date | null) => {
        if (!date) {
          return null;
        }

        return dayjs(date)
          .tz(reportTimezone)
          .format("YYYY-MM-DDTHH:mm:ss.SSSZ");
      },
    }),
    [initialValue, reportTimezone],
  );

  const valueFormat = isDateTime ? DEFAULT_DATETIME_STYLE : DEFAULT_DATE_STYLE;

  const [value, setValue] = useState<Date | null>(initialDate);
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
    <DatesProvider
      settings={{
        timezone: reportTimezone,
        locale,
        firstDayOfWeek,
        consistentWeeks,
      }}
    >
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
    </DatesProvider>
  );
};
