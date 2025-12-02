import dayjs from "dayjs";
import { useField } from "formik";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback, useMemo } from "react";

import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { DateInput, type DateInputProps, type DateValue } from "metabase/ui";
export type FormDateInputProps = {
  value?: DateValue | undefined;
  className?: string;
  style?: React.CSSProperties;
  name: string;
  title?: string;
  description?: ReactNode;
  nullable?: boolean;
  optional?: boolean;
} & DateInputProps;

export const FormDateInput = forwardRef(function FormDateInput(
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
  ref: Ref<HTMLInputElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const date = useMemo(() => {
    return value ? dayjs.parseZone(value) : undefined;
  }, [value]);

  const handleChange = useCallback(
    (date: DateValue | undefined) => {
      if (date) {
        setValue(dayjs(date).format("YYYY-MM-DD"));
      } else {
        setValue(nullable ? null : undefined);
      }
    },
    [nullable, setValue],
  );

  return (
    <DateInput
      fw="bold"
      onChange={handleChange}
      {...props}
      id={id}
      ref={ref}
      label={title}
      name={name}
      value={dayjs(date).toDate()}
      error={touched && error != null}
      onBlur={onBlur}
    />
  );
});
