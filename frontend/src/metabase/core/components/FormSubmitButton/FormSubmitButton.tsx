import React, { forwardRef, Ref } from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import Button, { ButtonProps } from "metabase/core/components/Button";
import useFormStatus, { FormStatus } from "metabase/core/hooks/use-form-status";

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

  return (
    <Button
      {...props}
      ref={ref}
      type="submit"
      success={status === "success"}
      danger={status === "failed"}
      disabled={disabled || !isValid || isSubmitting}
    >
      {submitText}
    </Button>
  );
});

const getSubmitButtonText = (
  status: FormStatus,
  {
    normalText = t`Submit`,
    activeText = normalText,
    successText = t`Success`,
    failedText = t`Failed`,
  }: FormSubmitButtonProps,
) => {
  switch (status) {
    case "normal":
      return normalText;
    case "active":
      return activeText;
    case "success":
      return successText;
    case "failed":
      return failedText;
  }
};

export default FormSubmitButton;
