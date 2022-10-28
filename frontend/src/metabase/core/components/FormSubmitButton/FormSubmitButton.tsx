import React, { forwardRef, Ref } from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import Button, { ButtonProps } from "metabase/core/components/Button";
import { FormStatus } from "metabase/core/hooks/use-form-state";
import useFormStatus from "metabase/core/hooks/use-form-status";

export interface FormSubmitButtonProps extends Omit<ButtonProps, "children"> {
  normalText?: string;
  activeText?: string;
  successText?: string;
  failedText?: string;
}

const FormSubmitButton = forwardRef(function FormSubmitButton(
  { disabled, ...props }: FormSubmitButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { isValid, isSubmitting } = useFormikContext();
  const status = useFormStatus();
  const submitText = getSubmitButtonText(status, props);
  const isEnabled = isValid && !isSubmitting && !disabled;

  return (
    <Button
      {...props}
      ref={ref}
      type="submit"
      primary={isEnabled}
      success={status === "fulfilled"}
      danger={status === "rejected"}
      disabled={!isEnabled}
    >
      {submitText}
    </Button>
  );
});

const getSubmitButtonText = (
  status: FormStatus | undefined,
  {
    normalText = t`Submit`,
    activeText = normalText,
    successText = t`Success`,
    failedText = t`Failed`,
  }: FormSubmitButtonProps,
) => {
  switch (status) {
    case "pending":
      return activeText;
    case "fulfilled":
      return successText;
    case "rejected":
      return failedText;
    default:
      return normalText;
  }
};

export default FormSubmitButton;
