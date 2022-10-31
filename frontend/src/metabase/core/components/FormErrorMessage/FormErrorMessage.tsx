import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import useFormErrorMessage from "metabase/core/hooks/use-form-error-message";
import { ErrorMessageRoot } from "./FormErrorMessage.styled";

export interface FormErrorContentProps {
  message: string;
}

export interface FormErrorMessageProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode | ((props: FormErrorContentProps) => ReactNode);
}

const FormErrorMessage = forwardRef(function FormErrorMessage(
  { children = getErrorContent, ...props }: FormErrorMessageProps,
  ref: Ref<HTMLDivElement>,
) {
  const { message } = useFormErrorMessage();
  if (!message) {
    return null;
  }

  return (
    <ErrorMessageRoot {...props} ref={ref}>
      {typeof children === "function" ? children({ message }) : children}
    </ErrorMessageRoot>
  );
});

const getErrorContent = ({ message }: FormErrorContentProps) => {
  return message;
};

export default FormErrorMessage;
