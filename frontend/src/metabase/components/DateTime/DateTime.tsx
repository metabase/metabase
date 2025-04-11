import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { forwardRef } from "react";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import MetabaseSettings from "metabase/lib/settings";
import type { DatetimeUnit } from "metabase-types/api";

type DateTimeProps = {
  value: string | Date | number | Dayjs;
  componentProps?: React.ComponentProps<"span">;
  unit?: DatetimeUnit;
};

/**
 * note: this component intentionally doesn't let you pick a custom date format
 * because that is an instance setting and should be respected globally
 */
const DateTime = forwardRef<HTMLSpanElement, DateTimeProps>(function DateTime(
  { value, unit = "default", ...props }: DateTimeProps,
  ref,
) {
  const options = MetabaseSettings.formattingOptions();
  // Convert Dayjs to Date to ensure compatibility
  const valueToFormat = dayjs.isDayjs(value) ? value.toDate() : value;
  const formattedTime = formatDateTimeWithUnit(
    valueToFormat,
    unit ?? "default",
    options,
  );

  return (
    <span ref={ref} {...props}>
      {formattedTime}
    </span>
  );
});

// eslint-disable-next-line import/no-default-export -- legacy usage
export default DateTime;
