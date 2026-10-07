import { type HTMLAttributes, forwardRef } from "react";

import MetabaseSettings from "metabase/utils/settings";
import { hasExplicitTimezone } from "metabase/utils/time-dayjs";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import type { ColumnSettings, DatetimeUnit } from "metabase-types/api";

type DateTimeProps = HTMLAttributes<HTMLSpanElement> & {
  value: string | Date | number;
  unit?: DatetimeUnit;
  /** false keeps the value's own offset; for data values, not entity timestamps */
  local?: boolean;
};

export const getFormattedTime = (
  value: string | Date | number,
  unit?: DatetimeUnit,
  { local = true }: Pick<ColumnSettings, "local"> = {},
) => {
  // not useSetting: callers outside React, and TreeTable measures cells without providers
  const settingsOptions = MetabaseSettings.formattingOptions();
  // offset-less strings have no known timezone, so render them as written
  const canConvertToLocal =
    typeof value !== "string" || hasExplicitTimezone(value);
  return formatDateTimeWithUnit(value, unit ?? "default", {
    ...settingsOptions,
    local: local && canConvertToLocal,
  });
};

/**
 * Renders an entity timestamp in the browser's timezone.
 *
 * note: this component intentionally doesn't let you pick a custom date format
 * because that is an instance setting and should be respected globally
 */
export const DateTime = forwardRef<HTMLSpanElement, DateTimeProps>(
  function DateTime(
    { value, unit = "default", local = true, ...props }: DateTimeProps,
    ref,
  ) {
    const formattedTime = getFormattedTime(value, unit, { local });

    return (
      <span ref={ref} {...props}>
        {formattedTime}
      </span>
    );
  },
);
