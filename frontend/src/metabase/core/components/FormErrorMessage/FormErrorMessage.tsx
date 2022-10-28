import React, {
  forwardRef,
  HTMLAttributes,
  Ref,
  useLayoutEffect,
  useState,
} from "react";
import { useFormikContext } from "formik";
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

const useFormErrorMessage = () => {
  const { dirty } = useFormikContext();
  const { message } = useFormState();
  const [errorMessage, setErrorMessage] = useState(message);

  useLayoutEffect(() => {
    setErrorMessage(undefined);
  }, [dirty]);

  useLayoutEffect(() => {
    setErrorMessage(message);
  }, [message]);

  return errorMessage;
};

export default FormErrorMessage;
