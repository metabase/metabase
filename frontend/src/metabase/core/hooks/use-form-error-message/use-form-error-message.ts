import { useLayoutEffect, useState } from "react";
import { useFormikContext } from "formik";
import type { FormikErrors } from "formik";
import { t } from "ttag";
import useFormState from "metabase/core/hooks/use-form-state";

const useFormErrorMessage = (): string | undefined => {
  const { values, errors } = useFormikContext();
  const { status, message } = useFormState();
  const [isVisible, setIsVisible] = useState(false);

  useLayoutEffect(() => {
    setIsVisible(false);
  }, [values]);

  useLayoutEffect(() => {
    setIsVisible(status === "rejected");
  }, [status]);

  return isVisible ? getFormErrorMessage(errors, message) : undefined;
};

const getFormErrorMessage = <T>(errors: FormikErrors<T>, message?: string) => {
  const hasErrors = Object.keys(errors).length > 0;

  if (message) {
    return message;
  } else if (!hasErrors) {
    return t`An error occurred`;
  }
};

export default useFormErrorMessage;
