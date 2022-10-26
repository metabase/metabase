import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import InputField, {
  InputFieldProps,
} from "metabase/core/components/InputField";

export interface FormFieldProps
  extends Omit<InputFieldProps, "error" | "htmlFor"> {
  name: string;
}

const FormField = forwardRef(function FormField(
  { name, ...props }: FormFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  const [, meta] = useField(name);
  const { error, touched } = meta;

  return (
    <InputField
      {...props}
      ref={ref}
      htmlFor={name}
      error={touched ? error : undefined}
    />
  );
});

export default FormField;
