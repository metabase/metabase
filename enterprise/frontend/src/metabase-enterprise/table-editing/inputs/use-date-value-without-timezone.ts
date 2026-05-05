import dayjs from "dayjs";
import { useCallback, useMemo } from "react";

export enum DateValueTimezoneFormat {
  Always,
  Never,
  NonZero,
}

type UseDateValueWithoutTimezoneOptions = {
  valueFormat?: string;
  timezoneFormat?: DateValueTimezoneFormat;
};

export const useDateValueWithoutTimezone = (
  value: string | null,
  {
    valueFormat = "YYYY-MM-DDTHH:mm:ss",
    timezoneFormat = DateValueTimezoneFormat.NonZero,
  }: UseDateValueWithoutTimezoneOptions = {},
) => {
  const { timezoneOffsetString, timezoneOffset, localDate } = useMemo(() => {
    // If no value, we fall back to the browser timezone
    const parsedDate = dayjs.parseZone(value ?? new Date());

    const timezoneOffset = parsedDate.utcOffset();
    const timezoneOffsetString = parsedDate.format("Z");

    return {
      timezoneOffset,
      timezoneOffsetString,
      localDate: value ? dayjs.parseZone(value).format(valueFormat) : null,
    };
  }, [value, valueFormat]);

  const restoreTimezone = useCallback(
    (value: string | null) => {
      if (!value) {
        return null;
      }

      if (
        timezoneFormat === DateValueTimezoneFormat.Never ||
        (timezoneFormat === DateValueTimezoneFormat.NonZero &&
          timezoneOffset === 0)
      ) {
        return dayjs(value).format(valueFormat);
      }

      return dayjs(value).format(valueFormat) + timezoneOffsetString;
    },
    [valueFormat, timezoneOffsetString, timezoneOffset, timezoneFormat],
  );

  return { localDate, timezoneOffsetString, restoreTimezone };
};
