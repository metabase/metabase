import type { CSSProperties } from "react";

import { PublicComponentStylesWrapper } from "embedding-sdk-bundle/components/private/PublicComponentStylesWrapper";
import { DatePicker } from "metabase/ui";

export type DateRangeValue = [string | null, string | null];

export interface DateRangeCalendarProps {
  value?: DateRangeValue;
  defaultValue?: DateRangeValue;
  onChange?: (value: DateRangeValue) => void;
  minDate?: string;
  maxDate?: string;
  numberOfColumns?: number;
  className?: string;
  style?: CSSProperties;
}

export const DateRangeCalendar = ({
  value,
  defaultValue,
  onChange,
  minDate,
  maxDate,
  numberOfColumns = 2,
  className,
  style,
}: DateRangeCalendarProps) => (
  // Mantine scopes its CSS variables to `.mb-wrapper`, which this wrapper
  // carries. Without it the calendar renders unstyled inside a data app.
  <PublicComponentStylesWrapper
    className={className}
    style={{
      display: "inline-block",
      width: "fit-content",
      height: "auto",
      ...style,
    }}
  >
    <DatePicker
      type="range"
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      minDate={minDate}
      maxDate={maxDate}
      numberOfColumns={numberOfColumns}
      allowSingleDateInRange
    />
  </PublicComponentStylesWrapper>
);
