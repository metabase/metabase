import { useLayoutEffect, useState } from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import useFormContext from "metabase/core/hooks/use-form-context";

const useFormErrorMessage = (): string | undefined => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useFormErrorMessage;
