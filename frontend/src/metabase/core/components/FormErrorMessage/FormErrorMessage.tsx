import React, { forwardRef, HTMLAttributes, Ref } from "react";
import { useFormikContext } from "formik";
import { ErrorMessageRoot } from "metabase/core/components/FormErrorMessage/FormErrorMessage.styled";

export type FormErrorMessageProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
>;

const FormErrorMessage = forwardRef(function FormErrorMessage(
  props: FormErrorMessageProps,
  ref: Ref<HTMLDivElement>,
) {
  const { status } = useFormikContext();
  if (!status) {
    return null;
  }

  return (
    <ErrorMessageRoot {...props} ref={ref}>
      {status}
    </ErrorMessageRoot>
  );
});

export default FormErrorMessage;
