import React, { forwardRef, HTMLAttributes, Ref } from "react";
import useFormErrorMessage from "metabase/core/hooks/use-form-error-message";
import { ErrorMessageRoot } from "./FormErrorMessage.styled";

export type FormErrorMessageProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
>;

const FormErrorMessage = forwardRef(function FormErrorMessage(
  props: FormErrorMessageProps,
  ref: Ref<HTMLDivElement>,
) {
  const message = useFormErrorMessage();
  if (!message) {
    return null;
  }

  return (
    <ErrorMessageRoot {...props} ref={ref}>
      {message}
    </ErrorMessageRoot>
  );
});

export default FormErrorMessage;
