import React, { forwardRef, InputHTMLAttributes, Ref } from "react";
import { InputRoot } from "./FormInput.styled";

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  touched?: boolean;
  fullWidth?: boolean;
}

const FormInput = forwardRef(function FormInput(
  { error, touched, fullWidth, ...props }: FormInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const hasError = touched && Boolean(error);

  return (
    <InputRoot {...props} ref={ref} hasError={hasError} fullWidth={fullWidth} />
  );
});

export default FormInput;
