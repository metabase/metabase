import React, { forwardRef, Ref, useCallback, useMemo } from "react";
import moment, { Moment } from "moment";
import {
  getDateStyleFromSettings,
  getTimeStyleFromSettings,
} from "metabase/lib/time";
import DateWidget from "metabase/core/components/DateWidget";
import { FormField } from "./types";

const DATE_FORMAT = "YYYY-MM-DD";
const DATE_TIME_FORMAT = "YYYY-MM-DDTHH:mm:ss";

export interface FormDateWidgetProps {
  field: FormField;
  placeholder?: string;
  hasTime?: boolean;
  hasTimezone?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  tabIndex?: number;
}

const FormDateWidget = forwardRef(function FormDateWidget(
  {
    field,
    placeholder,
    hasTime,
    hasTimezone,
    readOnly,
    autoFocus,
    tabIndex,
  }: FormDateWidgetProps,
  ref: Ref<HTMLDivElement>,
) {
  const format = hasTime ? DATE_TIME_FORMAT : DATE_FORMAT;

  const value = useMemo(() => {
    return field.value ? moment(field.value, format) : undefined;
  }, [field, format]);

  const handleFocus = useCallback(() => {
    field.onFocus?.(field.value);
  }, [field]);

  const handleBlur = useCallback(() => {
    field.onBlur?.(field.value);
  }, [field]);

  const handleChangeDate = useCallback(
    (newValue?: Moment) => {
      field.onChange?.(newValue?.format(format));
    },
    [field, format],
  );

  return (
    <DateWidget
      ref={ref}
      date={value}
      placeholder={placeholder}
      hasTime={hasTime}
      hasTimezone={hasTimezone}
      dateFormat={getDateStyleFromSettings()}
      timeFormat={getTimeStyleFromSettings()}
      readOnly={readOnly}
      autoFocus={autoFocus}
      error={field.visited && !field.active && field.error != null}
      fullWidth
      tabIndex={tabIndex}
      aria-labelledby={`${field.name}-label`}
      onChangeDate={handleChangeDate}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
});

export default FormDateWidget;
