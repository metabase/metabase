import type { Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import type { ButtonProps } from "metabase/core/components/Button";
import Button from "metabase/core/components/Button";
import type { FormStatus } from "metabase/forms";
import { useFormSubmitButton } from "metabase/forms";

export interface FormSubmitButtonProps extends Omit<ButtonProps, "children"> {
  title?: string;
  activeTitle?: string;
  successTitle?: string;
  failedTitle?: string;
}

/**
 * @deprecated: use FormSubmitButton from "metabase/forms"
 */
const FormSubmitButton = forwardRef(function FormSubmitButton(
  { primary, success, danger, disabled, ...props }: FormSubmitButtonProps,
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
      success={success || status === "fulfilled"}
      danger={danger || status === "rejected"}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(FormSubmitButton, {
  Button: Button.Root,
});
