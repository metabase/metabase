import React, { forwardRef, Ref, useCallback, useMemo } from "react";
import { Moment } from "moment";
import {
  getNumericDateStyleFromSettings,
  getTimeStyleFromSettings,
  has24HourModeSetting,
  parseTimestamp,
} from "metabase/lib/time";
import DateWidget from "metabase/core/components/DateWidget";
import { FormField } from "./types";

export interface FormDateWidgetProps {
  field: FormField;
  placeholder?: string;
  hasTime?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  tabIndex?: number;
}

const FormDateWidget = forwardRef(function FormDateWidget(
  {
    field,
    placeholder,
    hasTime,
    readOnly,
    autoFocus,
    tabIndex,
  }: FormDateWidgetProps,
  ref: Ref<HTMLDivElement>,
) {
  const value = useMemo(() => {
    return field.value ? parseTimestamp(field.value) : undefined;
  }, [field]);

  const handleChange = useCallback(
    (newValue?: Moment) => {
      field.onChange?.(newValue?.format());
    },
    [field],
  );

  const handleFocus = useCallback(() => {
    field.onFocus?.(field.value);
  }, [field]);

  const handleBlur = useCallback(() => {
    field.onBlur?.(field.value);
  }, [field]);

  return (
    <DateWidget
      ref={ref}
      value={value}
      placeholder={placeholder}
      hasTime={hasTime}
      dateFormat={getNumericDateStyleFromSettings()}
      timeFormat={getTimeStyleFromSettings()}
      is24HourMode={has24HourModeSetting()}
      readOnly={readOnly}
      autoFocus={autoFocus}
      error={field.visited && !field.active && field.error != null}
      fullWidth
      tabIndex={tabIndex}
      aria-labelledby={`${field.name}-label`}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
});

export default FormDateWidget;
