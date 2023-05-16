import React, { forwardRef, InputHTMLAttributes, Ref } from "react";
import cx from "classnames";
import { FormInputRoot } from "./FormInput.styled";

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  touched?: boolean;
  error?: string | boolean;
}

const FormInput = forwardRef(function FormInput(
  { className, touched, error, ...props }: FormInputProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <FormInputRoot
      {...props}
      ref={ref}
      className={cx("input", className)}
      type="text"
      touched={touched}
      error={error}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormInput;
