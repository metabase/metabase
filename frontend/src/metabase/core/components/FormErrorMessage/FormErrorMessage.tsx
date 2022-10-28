import React, {
  forwardRef,
  HTMLAttributes,
  Ref,
  useLayoutEffect,
  useState,
} from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import useFormState from "metabase/core/hooks/use-form-state";
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

const DEFAULT_ERROR_MESSAGE = t`An error occurred`;

const useFormErrorMessage = () => {
  const { dirty } = useFormikContext();
  const { status, message } = useFormState();
  const [errorMessage, setErrorMessage] = useState(message);

  useLayoutEffect(() => {
    if (dirty) {
      setErrorMessage(undefined);
    }
  }, [dirty]);

  useLayoutEffect(() => {
    if (status === "rejected") {
      setErrorMessage(message ?? DEFAULT_ERROR_MESSAGE);
    }
  }, [status, message]);

  return errorMessage;
};

export default FormErrorMessage;
