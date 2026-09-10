import type { CSSProperties, ReactNode } from "react";
import { t } from "ttag";

import { PublicComponentStylesWrapper } from "embedding-sdk-bundle/components/private/PublicComponentStylesWrapper";
import { DatePickerInput } from "metabase/ui";

export type DateRangeValue = [string | null, string | null];

export interface DateRangePickerProps {
  value?: DateRangeValue;
  defaultValue?: DateRangeValue;
  onChange?: (value: DateRangeValue) => void;
  label?: ReactNode;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  clearable?: boolean;
  disabled?: boolean;
  numberOfColumns?: number;
  valueFormat?: string;
  className?: string;
  style?: CSSProperties;
}

export const DateRangePicker = ({
  value,
  defaultValue,
  onChange,
  label,
  placeholder,
  minDate,
  maxDate,
  clearable,
  disabled,
  numberOfColumns = 2,
  valueFormat,
  className,
  style,
}: DateRangePickerProps) => (
  // Mantine scopes its CSS variables to `.mb-wrapper`, which this wrapper
  // carries. Without it the picker renders unstyled inside a data app.
  <PublicComponentStylesWrapper
    className={className}
    style={{
      display: "inline-block",
      width: "fit-content",
      height: "auto",
      ...style,
    }}
  >
    <DatePickerInput
      type="range"
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      label={label}
      placeholder={placeholder ?? t`Select a date range`}
      minDate={minDate}
      maxDate={maxDate}
      clearable={clearable}
      disabled={disabled}
      numberOfColumns={numberOfColumns}
      valueFormat={valueFormat}
      allowSingleDateInRange
    />
  </PublicComponentStylesWrapper>
);
