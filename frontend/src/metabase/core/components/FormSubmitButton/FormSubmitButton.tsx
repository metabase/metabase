import React, {
  forwardRef,
  Ref,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import Button, { ButtonProps } from "metabase/core/components/Button";
import useFormState from "metabase/core/hooks/use-form-state";

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

const STATUS_TIMEOUT = 5000;

const useFormStatus = () => {
  const { status } = useFormState();
  const isRecent = useIsRecent(status, STATUS_TIMEOUT);

  switch (status) {
    case "pending":
      return status;
    case "fulfilled":
    case "rejected":
      return isRecent ? status : undefined;
  }
};

const useIsRecent = (value: unknown, timeout: number) => {
  const [isRecent, setIsRecent] = useState(true);

  useEffect(() => {
    const timerId = setTimeout(() => setIsRecent(false), timeout);
    return () => clearTimeout(timerId);
  }, [value, timeout]);

  useLayoutEffect(() => {
    setIsRecent(true);
  }, [value]);

  return isRecent;
};

const getSubmitButtonText = (
  status: "pending" | "fulfilled" | "rejected" | undefined,
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
