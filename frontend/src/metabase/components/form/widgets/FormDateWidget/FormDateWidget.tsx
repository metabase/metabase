import React, { forwardRef, Ref, useCallback, useMemo } from "react";
import moment, { Moment } from "moment-timezone";
import Settings from "metabase/lib/settings";
import {
  getDateStyleFromSettings,
  getTimeStyleFromSettings,
} from "metabase/lib/time";
import DateWidget from "metabase/core/components/DateWidget";
import { FormField, FormValues } from "./types";

export interface FormDateWidgetProps {
  field: FormField;
  values?: FormValues;
  placeholder?: string;
  hasTime?: boolean;
  hasTimezone?: boolean;
  timezoneFieldName?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  tabIndex?: number;
  onChangeField?: (name: string, value?: string) => void;
}

const FormDateWidget = forwardRef(function FormDateWidget(
  {
    field,
    placeholder,
    values,
    hasTime,
    hasTimezone,
    timezoneFieldName = "timezone",
    readOnly,
    autoFocus,
    tabIndex,
    onChangeField,
  }: FormDateWidgetProps,
  ref: Ref<HTMLDivElement>,
) {
  const value = useMemo(() => {
    return field.value ? moment.parseZone(field.value) : undefined;
  }, [field]);

  const handleFocus = useCallback(() => {
    field.onFocus?.(field.value);
  }, [field]);

  const handleBlur = useCallback(() => {
    field.onBlur?.(field.value);
  }, [field]);

  const handleChangeDate = useCallback(
    (newValue?: Moment) => {
      field.onChange?.(newValue?.format());
    },
    [field],
  );

  const handleChangeTimezone = useCallback(
    (timezone?: string) => {
      onChangeField?.(timezoneFieldName, timezone);
    },
    [timezoneFieldName, onChangeField],
  );

  return (
    <DateWidget
      ref={ref}
      date={value}
      hasTime={hasTime}
      timezone={values?.timezone}
      timezones={Settings.get("available-timezones")}
      hasTimezone={hasTimezone}
      placeholder={placeholder}
      dateFormat={getDateStyleFromSettings()}
      timeFormat={getTimeStyleFromSettings()}
      readOnly={readOnly}
      autoFocus={autoFocus}
      error={field.visited && !field.active && field.error != null}
      fullWidth
      tabIndex={tabIndex}
      aria-labelledby={`${field.name}-label`}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChangeDate={handleChangeDate}
      onChangeTimezone={handleChangeTimezone}
    />
  );
});

export default FormDateWidget;
