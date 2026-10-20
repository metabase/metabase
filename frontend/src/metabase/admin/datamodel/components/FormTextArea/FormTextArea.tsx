import cx from "classnames";
import type { Ref, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";

import S from "./FormTextArea.module.css";

interface FormTextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  touched?: boolean;
  error?: string | boolean;
}

const FormTextArea = forwardRef(function FormTextArea(
  { className, touched, error, ...props }: FormTextAreaProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  return (
    <Box
      component="textarea"
      {...props}
      ref={ref}
      className={cx(CS.input, { [S.error]: touched && error }, className)}
      w="100%"
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormTextArea;
