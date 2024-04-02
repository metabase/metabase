import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import type { ButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

import type { FormStatus } from "../../contexts";
import { useFormSubmitButton } from "../../hooks";

export interface FormSubmitButtonProps extends Omit<ButtonProps, "children"> {
  label?: ReactNode;
  activeLabel?: ReactNode;
  successLabel?: ReactNode;
  failedLabel?: ReactNode;
}

export const FormSubmitButton = forwardRef(function FormSubmitButton(
  {
    label,
    activeLabel,
    successLabel,
    failedLabel,
    disabled,
    color,
    ...props
  }: FormSubmitButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { status, isDisabled } = useFormSubmitButton({ isDisabled: disabled });

  const submitLabel = getSubmitButtonLabel(status, {
    label,
    activeLabel,
    successLabel,
    failedLabel,
  });
  const submitColor = getSubmitButtonColor(status, { color });

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

type SubmitButtonColorOpts = Pick<FormSubmitButtonProps, "color">;

const getSubmitButtonColor = (
  status: FormStatus | undefined,
  { color }: SubmitButtonColorOpts,
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

type SubmitButtonLabelOpts = Pick<
  FormSubmitButtonProps,
  "label" | "activeLabel" | "successLabel" | "failedLabel"
>;

const getSubmitButtonLabel = (
  status: FormStatus | undefined,
  {
    label = t`Submit`,
    activeLabel = label,
    successLabel = t`Success`,
    failedLabel = t`Failed`,
  }: SubmitButtonLabelOpts,
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
