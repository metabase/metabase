import React, { forwardRef, InputHTMLAttributes, Ref } from "react";
import { InputRoot } from "./FormInput.styled";

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean | string;
  fullWidth?: boolean;
}

const FormInput = forwardRef(function FormInput(
  { error, fullWidth, ...props }: FormInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const hasError = Boolean(error);

  return (
    <InputRoot {...props} ref={ref} hasError={hasError} fullWidth={fullWidth} />
  );
});

export default FormInput;
