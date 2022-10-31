import React, { forwardRef, ReactNode, Ref } from "react";
import { t } from "ttag";
import Button, { ButtonProps } from "metabase/core/components/Button";
import { FormStatus } from "metabase/core/hooks/use-form-state";
import useFormSubmitButton from "metabase/core/hooks/use-form-submit-button";

export interface FormSubmitTextProps {
  status: FormStatus;
  isEnabled: boolean;
}

export interface FormSubmitButtonProps extends ButtonProps {
  children?: ReactNode | ((props: FormSubmitTextProps) => ReactNode);
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
  const { status, isEnabled } = useFormSubmitButton({ disabled });

  return (
    <Button
      {...props}
      ref={ref}
      type="submit"
      primary={primary && isEnabled}
      success={status === "fulfilled"}
      danger={status === "rejected"}
      disabled={!isEnabled}
    >
      {typeof children === "function"
        ? children({ status, isEnabled })
        : children}
    </Button>
  );
});

const getSubmitButtonText = ({ status }: FormSubmitTextProps) => {
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
