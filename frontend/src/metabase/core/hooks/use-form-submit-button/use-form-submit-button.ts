import { useEffect, useLayoutEffect, useState } from "react";
import { useFormikContext } from "formik";
import type { FormStatus } from "metabase/core/hooks/use-form-context";
import useFormContext from "metabase/core/hooks/use-form-context";

const STATUS_TIMEOUT = 5000;

export interface UseFormSubmitButtonProps {
  isDisabled?: boolean;
}

export interface UseFormSubmitButtonResult {
  status: FormStatus;
  isDisabled: boolean;
}

const useFormSubmitButton = ({
  isDisabled = false,
}: UseFormSubmitButtonProps): UseFormSubmitButtonResult => {
  const { isValid, isSubmitting } = useFormikContext();
  const { status } = useFormContext();
  const isRecent = useIsRecent(status, STATUS_TIMEOUT);

  return {
    status: getFormStatus(status, isRecent),
    isDisabled: !isValid || isSubmitting || isDisabled,
  };
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

const getFormStatus = (status: FormStatus, isRecent: boolean): FormStatus => {
  switch (status) {
    case "fulfilled":
    case "rejected":
      return isRecent ? status : "idle";
    default:
      return status;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useFormSubmitButton;
