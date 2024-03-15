import cx from "classnames";
import type { InputHTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import InputS from "metabase/css/core/inputs.module.css";

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
      value={props.value ?? ""}
      ref={ref}
      className={cx(InputS.input, className)}
      type="text"
      touched={touched}
      error={error}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormInput;
