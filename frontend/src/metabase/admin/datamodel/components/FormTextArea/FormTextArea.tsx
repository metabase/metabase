import cx from "classnames";
import type { Ref, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

import CS from "metabase/css/core/index.css";

import { FormTextAreaRoot } from "./FormTextArea.styled";

interface FormTextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  touched?: boolean;
  error?: string | boolean;
}

const FormTextArea = forwardRef(function FormTextArea(
  { className, touched, error, ...props }: FormTextAreaProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  return (
    <FormTextAreaRoot
      {...props}
      ref={ref}
      className={cx(CS.input, className)}
      touched={touched}
      error={error}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormTextArea;
