import cx from "classnames";
import type { InputHTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";

import S from "./FormInput.module.css";

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  touched?: boolean;
  error?: string | boolean;
}

const FormInput = forwardRef(function FormInput(
  { className, touched, error, ...props }: FormInputProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <Box
      component="input"
      {...props}
      value={props.value ?? ""}
      ref={ref}
      className={cx(CS.input, { [S.error]: touched && error }, className)}
      type="text"
      w="100%"
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormInput;
