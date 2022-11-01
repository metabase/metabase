import React, { forwardRef, ReactNode, Ref } from "react";
import { t } from "ttag";
import Button, { ButtonProps } from "metabase/core/components/Button";
import { FormStatus } from "metabase/core/hooks/use-form-state";
import useFormSubmitButton from "metabase/core/hooks/use-form-submit-button";

export interface FormSubmitContentProps {
  status: FormStatus;
}

export interface FormSubmitButtonProps extends ButtonProps {
  children?: ReactNode | ((props: FormSubmitContentProps) => ReactNode);
}

const FormSubmitButton = forwardRef(function FormSubmitButton(
  {
    primary,
    disabled,
    children = getSubmitButtonText,
    ...props
  }: FormSubmitButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { status, isDisabled } = useFormSubmitButton({ isDisabled: disabled });

  return (
    <Button
      {...props}
      ref={ref}
      type="submit"
      primary={primary && !isDisabled}
      success={status === "fulfilled"}
      danger={status === "rejected"}
      disabled={isDisabled}
    >
      {typeof children === "function" ? children({ status }) : children}
    </Button>
  );
});

const getSubmitButtonText = ({ status }: FormSubmitContentProps) => {
  switch (status) {
    case "fulfilled":
      return t`Success`;
    case "rejected":
      return t`Failed`;
    default:
      return t`Submit`;
  }
};

export default FormSubmitButton;
