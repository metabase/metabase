import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import Field, { FieldProps } from "metabase/core/components/Field";

export interface FormFieldProps extends Omit<FieldProps, "error" | "htmlFor"> {
  name: string;
}

const FormField = forwardRef(function FormField(
  { name, ...props }: FormFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  const [, meta] = useField(name);
  const { error, touched } = meta;

  return (
    <Field
      {...props}
      ref={ref}
      htmlFor={name}
      error={touched ? error : undefined}
    />
  );
});

export default FormField;
