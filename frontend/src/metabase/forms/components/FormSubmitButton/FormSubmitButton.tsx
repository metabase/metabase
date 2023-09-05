import type { Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";
import { Button } from "metabase/ui";
import type { ButtonProps } from "metabase/ui";
import type { FormStatus } from "../../contexts";
import { useFormSubmitButton } from "../../hooks";

export interface FormSubmitButtonProps extends Omit<ButtonProps, "children"> {
  title?: string;
  activeTitle?: string;
  successTitle?: string;
  failedTitle?: string;
}

export const FormSubmitButton = forwardRef(function FormSubmitButton(
  { disabled, ...props }: FormSubmitButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { status, isDisabled } = useFormSubmitButton({ isDisabled: disabled });
  const submitTitle = getSubmitButtonTitle(status, props);
  const submitColor = getSubmitButtonColor(status, props);

  return (
    <Button
      {...props}
      ref={ref}
      type="submit"
      color={submitColor}
      disabled={isDisabled}
    >
      {submitTitle}
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
