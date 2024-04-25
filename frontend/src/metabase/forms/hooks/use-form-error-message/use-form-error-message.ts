import { useFormikContext } from "formik";
import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { useFormContext } from "../use-form-context";

export const useFormErrorMessage = (): string | undefined => {
  const { values, errors } = useFormikContext();
  const { status, message } = useFormContext();
  const [isVisible, setIsVisible] = useState(false);
  const hasErrors = Object.keys(errors).length > 0;

  useLayoutEffect(() => {
    setIsVisible(false);
  }, [values]);

  useLayoutEffect(() => {
    setIsVisible(status === "rejected");
  }, [status]);

  if (!isVisible) {
    return undefined;
  } else if (message) {
    return message;
  } else if (!hasErrors) {
    return t`An error occurred`;
  }
};
