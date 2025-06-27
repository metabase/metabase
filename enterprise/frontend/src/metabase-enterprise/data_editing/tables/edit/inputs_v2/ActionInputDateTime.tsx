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

import type { ActionInputSharedProps } from "./types";

const DEFAULT_DATETIME_STYLE = `${DEFAULT_DATE_STYLE}, ${DEFAULT_TIME_STYLE}`;

type ActionInputDateTimeProps = ActionInputSharedProps & {
  isDateTime?: boolean;
  dateStyle?: string;
  dateTimeStyle?: string;
  classNames?: {
    wrapper?: string;
    dateTextInputElement?: string;
  };
};

export const ActionInputDateTime = ({
  isDateTime,
  dateStyle = DEFAULT_DATE_STYLE,
  dateTimeStyle = DEFAULT_DATETIME_STYLE,
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  onChange,
  onBlur,
  onEscape,
  onEnter,
}: ActionInputDateTimeProps) => {
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

  const valueFormat = isDateTime ? dateTimeStyle : dateStyle;

  const [value, setValue] = useState<Date | null>(initialDate);
  const [isFocused, setFocused] = useState(false);

  const handleChange = useCallback(
    (value: Date | null) => {
      setValue(value);
      onChange?.(restoreTimezone(value));
    },
    [onChange, restoreTimezone],
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
