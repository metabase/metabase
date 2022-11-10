import React, { forwardRef, Ref } from "react";
import { t } from "ttag";
import Button, { ButtonProps } from "metabase/core/components/Button";
import { FormStatus } from "metabase/core/hooks/use-form-state";
import useFormSubmitButton from "metabase/core/hooks/use-form-submit-button";

export interface FormSubmitButtonProps extends Omit<ButtonProps, "children"> {
  title?: string;
  activeTitle?: string;
  successTitle?: string;
  failedTitle?: string;
}

const FormSubmitButton = forwardRef(function FormSubmitButton(
  { primary, disabled, ...props }: FormSubmitButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { status, isDisabled } = useFormSubmitButton({ isDisabled: disabled });
  const submitTitle = getSubmitButtonTitle(status, props);

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
      {submitTitle}
    </Button>
  );
});

const getSubmitButtonTitle = (
  status: FormStatus | undefined,
  {
    title = t`Submit`,
    activeTitle = title,
    successTitle = t`Success`,
    failedTitle = t`Failed`,
  }: FormSubmitButtonProps,
) => {
  switch (status) {
    case "pending":
      return activeTitle;
    case "fulfilled":
      return successTitle;
    case "rejected":
      return failedTitle;
    default:
      return title;
  }
};

export default FormSubmitButton;
