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
  values: Record<string, unknown>;
  readOnly?: boolean;
  autoFocus?: boolean;
  tabIndex?: number;
  hasTimeField?: string;
  onChangeField?: (field: string, value: unknown) => void;
}

const FormDateWidget = forwardRef(function FormDateWidget(
  {
    field,
    placeholder,
    values,
    readOnly,
    autoFocus,
    tabIndex,
    hasTimeField = "",
    onChangeField,
  }: FormDateWidgetProps,
  ref: Ref<HTMLDivElement>,
) {
  const value = useMemo(() => {
    return field.value ? parseTimestamp(field.value) : undefined;
  }, [field]);

  const handleFocus = useCallback(() => {
    field.onFocus?.(field.value);
  }, [field]);

  const handleBlur = useCallback(() => {
    field.onBlur?.(field.value);
  }, [field]);

  const handleChange = useCallback(
    (newValue?: Moment) => {
      field.onChange?.(newValue?.format());
    },
    [field],
  );

  const handleHasTimeChange = useCallback(
    (hasTime: boolean) => {
      onChangeField?.(hasTimeField, hasTime);
    },
    [hasTimeField, onChangeField],
  );

  return (
    <DateWidget
      ref={ref}
      value={value}
      placeholder={placeholder}
      hasTime={Boolean(values[hasTimeField])}
      dateFormat={getNumericDateStyleFromSettings()}
      timeFormat={getTimeStyleFromSettings()}
      is24HourMode={has24HourModeSetting()}
      readOnly={readOnly}
      autoFocus={autoFocus}
      error={field.visited && !field.active && field.error != null}
      fullWidth
      tabIndex={tabIndex}
      aria-labelledby={`${field.name}-label`}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      onHasTimeChange={handleHasTimeChange}
    />
  );
});

export default FormDateWidget;
