import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import Input, { InputProps } from "metabase/core/components/Input";

export interface FormInputProps
  extends Omit<InputProps, "value" | "error" | "onChange" | "onBlur"> {
  name: string;
}

const FormInput = forwardRef(function FormInput(
  { name, ...props }: FormInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [field, meta] = useField(name);

  return (
    <Input
      {...props}
      ref={ref}
      id={name}
      name={name}
      value={field.value}
      error={meta.touched && meta.error != null}
      onChange={field.onChange}
      onBlur={field.onBlur}
    />
  );
});

export default FormInput;
