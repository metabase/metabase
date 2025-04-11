import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useField } from "formik";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback, useMemo } from "react";

import type { DateWidgetProps } from "metabase/core/components/DateWidget";
import DateWidget from "metabase/core/components/DateWidget";
import FormField from "metabase/core/components/FormField";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export interface FormDateInputProps
  extends Omit<
    DateWidgetProps,
    "value" | "error" | "fullWidth" | "onChange" | "onBlur"
  > {
  name: string;
  title?: string;
  description?: ReactNode;
  nullable?: boolean;
  optional?: boolean;
}

const FormDateInput = forwardRef(function FormDateInput(
  {
    name,
    className,
    style,
    title,
    description,
    nullable,
    optional,
    ...props
  }: FormDateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const date = useMemo(() => {
    return value ? dayjs.parseZone(value) : undefined;
  }, [value]);

  const handleChange = useCallback(
    (date: Dayjs | undefined) => {
      if (date) {
        setValue(date.toISOString());
      } else {
        setValue(nullable ? null : undefined);
      }
    },
    [nullable, setValue],
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
      optional={optional}
    >
      <DateWidget
        {...props}
        id={id}
        name={name}
        value={date}
        error={touched && error != null}
        fullWidth
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormDateInput;
