import { forwardRef, HTMLAttributes, Ref } from "react";
import useFormErrorMessage from "metabase/core/hooks/use-form-error-message";
import { ErrorMessageRoot } from "./FormErrorMessage.styled";

export interface FormErrorMessageProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  inline?: boolean;
}

const FormErrorMessage = forwardRef(function FormErrorMessage(
  { inline, ...props }: FormErrorMessageProps,
  ref: Ref<HTMLDivElement>,
) {
  const message = useFormErrorMessage();
  if (!message) {
    return null;
  }

  return (
    <ErrorMessageRoot {...props} ref={ref} inline={inline}>
      {message}
    </ErrorMessageRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormErrorMessage;
