import React, { forwardRef, Ref, useCallback, useMemo } from "react";
import moment, { Moment } from "moment";
import DateInput from "metabase/core/components/DateInput";
import { FormField } from "./types";

const DATE_FORMAT = "YYYY-MM-DD";

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
    return field.value ? moment(field.value, DATE_FORMAT) : undefined;
  }, [field]);

  const handleChange = useCallback(
    (newValue?: Moment) => {
      field.onChange?.(newValue?.format(DATE_FORMAT));
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
    <DateInput
      ref={ref}
      value={value}
      placeholder={placeholder}
      hasTime={hasTime}
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
