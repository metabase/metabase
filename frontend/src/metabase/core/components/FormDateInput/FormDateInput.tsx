import React, { forwardRef, ReactNode, Ref, useCallback, useMemo } from "react";
import moment, { Moment } from "moment-timezone";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import DateWidget, {
  DateWidgetProps,
} from "metabase/core/components/DateWidget";
import FormField from "metabase/core/components/FormField";

export interface FormDateInputProps
  extends Omit<DateWidgetProps, "value" | "error" | "onChange" | "onBlur"> {
  name: string;
  title?: string;
  description?: ReactNode;
}

const FormDateInput = forwardRef(function FormDateInput(
  { name, className, style, title, description, ...props }: FormDateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const date = useMemo(() => {
    return value ? moment.parseZone(value) : undefined;
  }, [value]);

  const handleChange = useCallback(
    (date?: Moment) => {
      setValue(date?.toISOString(true));
    },
    [setValue],
  );

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
    >
      <DateWidget
        {...props}
        id={id}
        name={name}
        value={date}
        error={touched && error != null}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

export default FormDateInput;
