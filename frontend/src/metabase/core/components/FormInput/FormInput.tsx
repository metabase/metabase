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
  const [{ value, onChange, onBlur }, { error, touched }] = useField(name);

  return (
    <Input
      {...props}
      ref={ref}
      id={name}
      name={name}
      value={value}
      error={touched && error != null}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
});

export default FormInput;
