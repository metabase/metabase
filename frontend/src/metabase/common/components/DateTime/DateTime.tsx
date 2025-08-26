import { forwardRef } from "react";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";
import MetabaseSettings from "metabase/lib/settings";
import type { DatetimeUnit } from "metabase-types/api";

type DateTimeProps = {
  value: string | Date | number;
  componentProps?: React.ComponentProps<"span">;
  unit?: DatetimeUnit;
};

export const getFormattedTime = (
  value: string | Date | number,
  unit?: DatetimeUnit,
  options: Pick<OptionsType, "local"> = {},
) => {
  const settingsOptions = MetabaseSettings.formattingOptions();
  return formatDateTimeWithUnit(value, unit ?? "default", {
    ...options,
    ...settingsOptions,
  });
};

/**
 * note: this component intentionally doesn't let you pick a custom date format
 * because that is an instance setting and should be respected globally
 */
const DateTime = forwardRef<HTMLSpanElement, DateTimeProps>(function DateTime(
  { value, unit = "default", ...props }: DateTimeProps,
  ref,
) {
  const formattedTime = getFormattedTime(value, unit);

  return (
    <span ref={ref} {...props}>
      {formattedTime}
    </span>
  );
});

// eslint-disable-next-line import/no-default-export -- legacy usage
export default DateTime;
