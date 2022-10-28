import { useLayoutEffect, useState } from "react";
import { useFormikContext } from "formik";
import useFormState from "metabase/core/hooks/use-form-state";

const useFormErrorMessage = () => {
  const { dirty } = useFormikContext();
  const { status, message } = useFormState();
  const [errorMessage, setErrorMessage] = useState(message);

  useLayoutEffect(() => {
    if (dirty) {
      setErrorMessage(undefined);
    }
  }, [dirty]);

  useLayoutEffect(() => {
    if (status === "rejected") {
      setErrorMessage(message);
    }
  }, [status, message]);

  return errorMessage;
};

export default useFormErrorMessage;
