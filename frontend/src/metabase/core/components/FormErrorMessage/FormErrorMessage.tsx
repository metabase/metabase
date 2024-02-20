import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import { useFormErrorMessage } from "metabase/forms";

import { ErrorMessageRoot } from "./FormErrorMessage.styled";

export interface FormErrorMessageProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  inline?: boolean;
}

/**
 * @deprecated: use FormErrorMessage from "metabase/forms"
 */
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
