import dayjs from "dayjs";
import { useCallback, useMemo } from "react";

export const useDateValueWithoutTimezone = (
  value: string | null,
  valueFormat: string = "YYYY-MM-DD HH:mm:ss",
) => {
  const { timezoneOffsetString, localDate } = useMemo(() => {
    // If no value, we use browser timezone
    const timezoneOffsetString = dayjs
      .parseZone(value ?? new Date())
      .format("Z");

    return {
      timezoneOffsetString,
      localDate: value ? dayjs.parseZone(value).format(valueFormat) : null,
    };
  }, [value, valueFormat]);

  const restoreTimezone = useCallback(
    (value: string | null) => {
      if (!value) {
        return null;
      }

      return dayjs(value).format(valueFormat) + timezoneOffsetString;
    },
    [valueFormat, timezoneOffsetString],
  );

  return { localDate, timezoneOffsetString, restoreTimezone };
};
