import type { Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";
import { Button } from "metabase/ui";
import type { ButtonProps } from "metabase/ui";
import type { FormStatus } from "../../contexts";
import { useFormSubmitButton } from "../../hooks";

export interface FormSubmitButtonProps extends Omit<ButtonProps, "children"> {
  label?: string;
  activeLabel?: string;
  successLabel?: string;
  failedLabel?: string;
}

export const FormSubmitButton = forwardRef(function FormSubmitButton(
  { disabled, ...props }: FormSubmitButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { status, isDisabled } = useFormSubmitButton({ isDisabled: disabled });
  const submitLabel = getSubmitButtonLabel(status, props);
  const submitColor = getSubmitButtonColor(status, props);

  return (
    <Button
      {...props}
      ref={ref}
      type="submit"
      color={submitColor}
      disabled={isDisabled}
    >
      {submitLabel}
    </Button>
  );
});

const getSubmitButtonColor = (
  status: FormStatus | undefined,
  { color }: FormSubmitButtonProps,
) => {
  switch (status) {
    case "fulfilled":
      return "success";
    case "rejected":
      return "error";
    default:
      return color;
  }
};

const getSubmitButtonLabel = (
  status: FormStatus | undefined,
  {
    label = t`Submit`,
    activeLabel = label,
    successLabel = t`Success`,
    failedLabel = t`Failed`,
  }: FormSubmitButtonProps,
) => {
  switch (status) {
    case "pending":
      return activeLabel;
    case "fulfilled":
      return successLabel;
    case "rejected":
      return failedLabel;
    default:
      return label;
  }
};
