import { useContext, useEffect, useLayoutEffect, useState } from "react";
import { useFormikContext } from "formik";
import FormContext, { FormStatus } from "metabase/core/context/FormContext";

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
  const { state } = useContext(FormContext);
  const { status } = state;
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

export default useFormSubmitButton;
